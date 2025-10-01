import os
import random
import string
from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from dotenv import load_dotenv
from game import DominoGame

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')

CORS(app, resources={
    r"/*": {
        "origins": os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')
    }
})

socketio = SocketIO(app, cors_allowed_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(','))

# Armazena as salas de jogo ativas
games = {}

def generate_room_code():
    """Gera um código único de 6 caracteres para a sala"""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in games:
            return code

@app.route('/')
def index():
    return {"status": "Dominó Server Running", "active_rooms": len(games)}

@socketio.on('connect')
def handle_connect():
    print(f'Cliente conectado: {request.sid}')
    emit('connected', {'message': 'Conectado ao servidor'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Cliente desconectado: {request.sid}')

    # Remove jogador de qualquer sala
    for room_code, game in list(games.items()):
        if request.sid in game.players:
            player_name = game.players[request.sid]['name']
            game.remove_player(request.sid)
            leave_room(room_code)

            # Só notifica se ainda há outros jogadores na sala
            if len(game.players) > 0:
                emit('player_left', {
                    'message': f'{player_name} saiu da sala'
                }, room=room_code)
            
            # Remove sala se estiver vazia
            if len(game.players) == 0:
                del games[room_code]
                print(f'Sala {room_code} removida (vazia)')

@socketio.on('create_room')
def handle_create_room(data):
    """Cria uma nova sala de jogo"""
    player_name = data.get('name', 'Jogador')
    room_code = generate_room_code()

    game = DominoGame(room_code)
    game.add_player(request.sid, player_name)
    games[room_code] = game

    join_room(room_code)

    emit('room_created', {
        'room_code': room_code,
        'player_name': player_name,
        'message': f'Sala {room_code} criada com sucesso'
    })

    print(f'Sala criada: {room_code} por {player_name}')

@socketio.on('join_room')
def handle_join_room(data):
    """Entra em uma sala existente"""
    room_code = data.get('room_code', '').upper()
    player_name = data.get('name', 'Jogador')

    if room_code not in games:
        emit('error', {'message': 'Sala não encontrada'})
        return

    game = games[room_code]

    # Verifica se o jogador já está na sala (reconexão)
    if request.sid in game.players:
        join_room(room_code)
        emit('room_joined', {
            'room_code': room_code,
            'player_name': player_name,
            'message': f'Reconectado à sala {room_code}'
        })
        
        # Se o jogo já começou, envia o estado atual
        if game.game_started:
            game_state = game.get_game_state(request.sid)
            emit('game_started', game_state)
        
        print(f'{player_name} se reconectou à sala {room_code}')
        return

    if not game.add_player(request.sid, player_name):
        emit('error', {'message': 'Sala cheia (máximo 2 jogadores)'})
        return

    join_room(room_code)

    # Notifica o jogador que entrou
    emit('room_joined', {
        'room_code': room_code,
        'player_name': player_name,
        'message': f'Você entrou na sala {room_code}'
    })

    # Notifica todos os jogadores da sala
    emit('player_joined', {
        'player_name': player_name,
        'players_count': len(game.players),
        'message': f'{player_name} entrou na sala'
    }, room=room_code)

    # Se temos 2 jogadores, inicia o jogo
    if len(game.players) == 2:
        game.start_game()

        # Envia estado do jogo para cada jogador
        for player_id in game.players:
            game_state = game.get_game_state(player_id)
            emit('game_started', game_state, room=player_id)

    print(f'{player_name} entrou na sala {room_code} (Total: {len(game.players)} jogadores)')

@socketio.on('play_piece')
def handle_play_piece(data):
    room_code = data.get('room_code')
    piece_left = data.get('left')
    piece_right = data.get('right')
    side = data.get('side', 'right')  # 'left' ou 'right'
    
    if room_code not in games:
        emit('error', {'message': 'Sala não encontrada'})
        return
    
    game = games[room_code]
    result = game.play_piece(request.sid, piece_left, piece_right, side)
    
    if not result['success']:
        emit('error', {'message': result['message']})
        return
    
    for player_id in game.players:
        game_state = game.get_game_state(player_id)
        emit('game_update', game_state, room=player_id)
    
    if result.get('game_finished'):
        emit('game_finished', {
            'winner': result['winner'],
            'message': f'{result["winner"]} venceu o jogo!'
        }, room=room_code)

@socketio.on('buy_piece')
def handle_buy_piece(data):
    """Jogador compra uma peça do pool"""
    room_code = data.get('room_code')

    if room_code not in games:
        emit('error', {'message': 'Sala não encontrada'})
        return

    game = games[room_code]
    result = game.buy_piece(request.sid)

    if not result['success']:
        emit('error', {'message': result['message']})
        return

    # Atualiza estado para todos os jogadores
    for player_id in game.players:
        game_state = game.get_game_state(player_id)
        emit('game_update', game_state, room=player_id)
        
    # Verifica se o jogo está bloqueado após a compra
    if result.get('game_blocked'):
        emit('game_finished', {
            'winner': result['winner'],
            'message': f'{result["winner"]} venceu! (Jogo bloqueado - menor pontuação)'
        }, room=room_code)

@socketio.on('pass_turn')
def handle_pass_turn(data):
    """Jogador passa a vez"""
    room_code = data.get('room_code')

    if room_code not in games:
        emit('error', {'message': 'Sala não encontrada'})
        return

    game = games[room_code]
    result = game.pass_turn(request.sid)

    if not result['success']:
        emit('error', {'message': result['message']})
        return

    # Atualiza estado para todos os jogadores
    for player_id in game.players:
        game_state = game.get_game_state(player_id)
        emit('game_update', game_state, room=player_id)
        
    # Verifica se o jogo está bloqueado
    if result.get('game_blocked'):
        emit('game_finished', {
            'winner': result['winner'],
            'message': f'{result["winner"]} venceu! (Jogo bloqueado - menor pontuação)'
        }, room=room_code)

@socketio.on('get_game_state')
def handle_get_game_state(data):
    """Retorna o estado atual do jogo"""
    room_code = data.get('room_code')

    if room_code not in games:
        emit('error', {'message': 'Sala não encontrada'})
        return

    game = games[room_code]
    game_state = game.get_game_state(request.sid)
    emit('game_state', game_state)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
