import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState('menu'); // menu, waiting, playing, finished
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [myHand, setMyHand] = useState([]);
  const [board, setBoard] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [players, setPlayers] = useState({});
  const [message, setMessage] = useState('');
  const [winner, setWinner] = useState(null);
  const [poolCount, setPoolCount] = useState(0);

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connected', (data) => {
      console.log('Conectado ao servidor:', data.message);
    });

    newSocket.on('room_created', (data) => {
      setRoomCode(data.room_code);
      setGameState('waiting');
      setMessage(`Sala criada! Código: ${data.room_code}`);
    });

    newSocket.on('room_joined', (data) => {
      setRoomCode(data.room_code);
      setGameState('waiting');
      setMessage(data.message);
    });

    newSocket.on('player_joined', (data) => {
      setMessage(data.message);
    });

    newSocket.on('game_started', (data) => {
      setGameState('playing');
      setMyHand(data.my_hand);
      setBoard(data.board);
      setCurrentPlayer(data.current_player);
      setPlayers(data.players);
      setPoolCount(data.pool_count);
      setMessage('Jogo iniciado! Boa sorte!');
    });

    newSocket.on('game_update', (data) => {
      setMyHand(data.my_hand);
      setBoard(data.board);
      setCurrentPlayer(data.current_player);
      setPlayers(data.players);
      setPoolCount(data.pool_count);
      
      if (data.game_finished) {
        setGameState('finished');
        setWinner(data.winner);
      }
    });

    newSocket.on('game_finished', (data) => {
      setGameState('finished');
      setWinner(data.winner);
      setMessage(data.message);
    });

    newSocket.on('player_left', (data) => {
      setMessage(data.message);
      setGameState('menu');
    });

    newSocket.on('error', (data) => {
      setMessage(data.message);
    });

    return () => newSocket.close();
  }, []);

  const createRoom = () => {
    if (!playerName.trim()) {
      setMessage('Digite seu nome!');
      return;
    }
    socket.emit('create_room', { name: playerName });
  };

  const joinRoom = () => {
    if (!playerName.trim() || !roomCode.trim()) {
      setMessage('Digite seu nome e o código da sala!');
      return;
    }
    socket.emit('join_room', { room_code: roomCode.toUpperCase(), name: playerName });
  };

  const playPiece = (piece) => {
    socket.emit('play_piece', {
      room_code: roomCode,
      left: piece.left,
      right: piece.right
    });
  };

  const buyPiece = () => {
    socket.emit('buy_piece', { room_code: roomCode });
  };

  const isMyTurn = () => {
    return currentPlayer === socket?.id;
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setMessage('Código copiado!');
  };

  // Renderização do Menu
  if (gameState === 'menu') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">🎲 Dominó</h1>
          <p className="text-center text-gray-600 mb-8">Multiplayer Online</p>

          <input
            type="text"
            placeholder="Seu nome"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-purple-500 focus:outline-none mb-4"
          />

          <button
            onClick={createRoom}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition mb-4"
          >
            Criar Sala
          </button>

          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-4 text-gray-500">ou</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          <input
            type="text"
            placeholder="Código da sala"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-purple-500 focus:outline-none mb-4"
          />

          <button
            onClick={joinRoom}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition"
          >
            Entrar na Sala
          </button>

          {message && (
            <div className="mt-4 p-3 bg-blue-100 border border-blue-300 rounded-lg text-blue-800 text-sm">
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Renderização da Sala de Espera
  if (gameState === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <h2 className="text-3xl font-bold text-center mb-4 text-gray-800">Aguardando jogador...</h2>
          
          <div className="bg-purple-100 border-2 border-purple-300 rounded-lg p-6 mb-6">
            <p className="text-center text-gray-700 mb-2">Código da Sala:</p>
            <div className="flex items-center justify-center gap-2">
              <p className="text-4xl font-mono font-bold text-purple-600">{roomCode}</p>
              <button
                onClick={copyRoomCode}
                className="p-2 hover:bg-purple-200 rounded transition"
                title="Copiar código"
              >
                📋
              </button>
            </div>
          </div>

          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Compartilhe o código com um amigo para começar!</p>
          </div>

          {message && (
            <div className="mt-4 p-3 bg-blue-100 border border-blue-300 rounded-lg text-blue-800 text-sm">
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Componente de Peça de Dominó
  const DominoPiece = ({ piece, onClick, disabled, small }) => {
    const sizeClass = small ? 'w-12 h-24' : 'w-16 h-32';
    const textSize = small ? 'text-lg' : 'text-2xl';
    
    return (
      <button
        onClick={() => onClick && onClick(piece)}
        disabled={disabled}
        className={`${sizeClass} bg-white border-4 border-gray-800 rounded-lg flex flex-col items-center justify-around p-1 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-lg cursor-pointer'
        } transition-all`}
      >
        <span className={`${textSize} font-bold`}>{piece.left}</span>
        <div className="w-full h-0.5 bg-gray-800"></div>
        <span className={`${textSize} font-bold`}>{piece.right}</span>
      </button>
    );
  };

  // Renderização do Jogo
  if (gameState === 'playing' || gameState === 'finished') {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Sala: {roomCode}</h2>
                <p className="text-sm text-gray-600">
                  {isMyTurn() ? '🟢 Seu turno!' : '🔴 Aguardando oponente...'}
                </p>
              </div>
              
              <div className="text-right">
                {Object.entries(players).map(([id, player]) => (
                  <div key={id} className="text-sm">
                    <span className={id === socket?.id ? 'font-bold text-purple-600' : 'text-gray-600'}>
                      {player.name}: {player.hand_count} peças
                    </span>
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-1">Pool: {poolCount} peças</p>
              </div>
            </div>

            {message && (
              <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded text-blue-800 text-sm">
                {message}
              </div>
            )}

            {gameState === 'finished' && (
              <div className="mt-2 p-3 bg-green-100 border-2 border-green-300 rounded-lg text-center">
                <p className="text-xl font-bold text-green-800">
                  {winner} venceu! 🎉
                </p>
              </div>
            )}
          </div>

          {/* Tabuleiro */}
          <div className="bg-green-800 rounded-lg shadow-lg p-6 mb-4 min-h-[200px]">
            <h3 className="text-white text-lg font-bold mb-4">Tabuleiro</h3>
            
            {board.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-white text-lg">Jogue a primeira peça!</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center">
                {board.map((piece, idx) => (
                  <DominoPiece key={idx} piece={piece} disabled small />
                ))}
              </div>
            )}
          </div>

          {/* Mão do Jogador */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-gray-800 text-lg font-bold mb-4">Sua Mão ({myHand.length} peças)</h3>
            
            <div className="flex flex-wrap gap-4 justify-center mb-4">
              {myHand.map((piece, idx) => (
                <DominoPiece
                  key={idx}
                  piece={piece}
                  onClick={playPiece}
                  disabled={!isMyTurn() || gameState === 'finished'}
                />
              ))}
            </div>

            {isMyTurn() && gameState !== 'finished' && (
              <div className="text-center">
                <button
                  onClick={buyPiece}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-6 rounded-lg transition"
                  disabled={poolCount === 0}
                >
                  {poolCount > 0 ? 'Comprar Peça do Pool' : 'Pool Vazio - Passar Vez'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
