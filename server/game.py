import random
from typing import List, Dict, Tuple, Optional

class DominoPiece:
    def __init__(self, left: int, right: int):
        self.left = left
        self.right = right

    def to_dict(self):
        return {"left": self.left, "right": self.right}

    def flip(self):
        self.left, self.right = self.right, self.left

    def __repr__(self):
        return f"[{self.left}|{self.right}]"

class DominoGame:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.players: Dict[str, Dict] = {}
        self.board: List[DominoPiece] = []
        self.current_player_index = 0
        self.game_started = False
        self.game_finished = False
        self.winner = None
        self.dominoes_pool: List[DominoPiece] = []
        self.consecutive_passes = 0

    def generate_dominoes(self) -> List[DominoPiece]:
        """Gera todas as 28 peças do dominó (0-0 até 6-6)"""
        dominoes = []
        for i in range(7):
            for j in range(i, 7):
                dominoes.append(DominoPiece(i, j))
        return dominoes

    def add_player(self, player_id: str, name: str) -> bool:
        """Adiciona um jogador à sala"""
        # Se o jogador já existe, apenas atualiza o nome (reconexão)
        if player_id in self.players:
            self.players[player_id]["name"] = name
            return True
            
        if len(self.players) >= 2:
            return False

        self.players[player_id] = {
            "name": name,
            "hand": [],
            "order": len(self.players)
        }
        return True

    def remove_player(self, player_id: str):
        """Remove um jogador da sala"""
        if player_id in self.players:
            del self.players[player_id]

    def start_game(self):
        """Inicia o jogo distribuindo as peças"""
        if len(self.players) != 2 or self.game_started:
            return False

        all_dominoes = self.generate_dominoes()
        random.shuffle(all_dominoes)

        player_ids = list(self.players.keys())

        # Distribui 7 peças para cada jogador
        for i, player_id in enumerate(player_ids):
            self.players[player_id]["hand"] = all_dominoes[i*7:(i+1)*7]

        # Peças restantes ficam no pool
        self.dominoes_pool = all_dominoes[14:]

        self.game_started = True
        self.current_player_index = 0

        return True

    def get_current_player_id(self) -> Optional[str]:
        """Retorna o ID do jogador atual"""
        if not self.game_started:
            return None
        player_ids = list(self.players.keys())
        return player_ids[self.current_player_index]

    def can_play_piece(self, piece: DominoPiece) -> Tuple[bool, Optional[str]]:
        """Verifica se uma peça pode ser jogada"""
        if len(self.board) == 0:
            return True, "start"

        left_end = self.board[0].left
        right_end = self.board[-1].right

        if piece.left == right_end or piece.right == right_end:
            return True, "right"
        if piece.left == left_end or piece.right == left_end:
            return True, "left"

        return False, None

    def play_piece(self, player_id: str, piece_left: int, piece_right: int, side: str = 'right') -> Dict:
        """Executa a jogada de uma peça no lado especificado"""
        if not self.game_started or self.game_finished:
            return {"success": False, "message": "Jogo não está em andamento"}
        
        if self.get_current_player_id() != player_id:
            return {"success": False, "message": "Não é seu turno"}
        
        piece = None
        for p in self.players[player_id]["hand"]:
            if (p.left == piece_left and p.right == piece_right) or \
            (p.left == piece_right and p.right == piece_left):
                piece = p
                break
        
        if not piece:
            return {"success": False, "message": "Peça não encontrada na sua mão"}
        
        can_play, _ = self.can_play_piece(piece)
        
        if not can_play:
            return {"success": False, "message": "Essa peça não pode ser jogada"}
        
        self.players[player_id]["hand"].remove(piece)
        
        if len(self.board) == 0:
            self.board.append(piece)
        elif side == 'left':
            left_end = self.board[0].left
            if piece.right == left_end:
                self.board.insert(0, piece)
            elif piece.left == left_end:
                piece.flip()
                self.board.insert(0, piece)
            else:
                return {"success": False, "message": "Peça não encaixa neste lado"}
        else:  # right
            right_end = self.board[-1].right
            if piece.left == right_end:
                self.board.append(piece)
            elif piece.right == right_end:
                piece.flip()
                self.board.append(piece)
            else:
                return {"success": False, "message": "Peça não encaixa neste lado"}
        
        # Reset contador de passes consecutivos quando uma peça é jogada
        self.consecutive_passes = 0
        
        if len(self.players[player_id]["hand"]) == 0:
            self.game_finished = True
            self.winner = player_id
            return {
                "success": True,
                "message": "Jogada realizada com sucesso",
                "game_finished": True,
                "winner": self.players[player_id]["name"]
            }
        
        self.current_player_index = (self.current_player_index + 1) % 2
        
        return {"success": True, "message": "Jogada realizada com sucesso"}

    def buy_piece(self, player_id: str) -> Dict:
        """Jogador compra uma peça do pool"""
        if not self.game_started or self.game_finished:
            return {"success": False, "message": "Jogo não está em andamento"}

        if self.get_current_player_id() != player_id:
            return {"success": False, "message": "Não é seu turno"}

        if len(self.dominoes_pool) == 0:
            return {"success": False, "message": "Pool vazio"}

        piece = self.dominoes_pool.pop()
        self.players[player_id]["hand"].append(piece)

        # Verifica se agora pode jogar
        can_play = any(self.can_play_piece(p)[0] for p in self.players[player_id]["hand"])
        
        if not can_play and len(self.dominoes_pool) == 0:
            # Verifica se o jogo está bloqueado
            blocked_result = self.check_game_blocked()
            if blocked_result["blocked"]:
                self.game_finished = True
                self.winner = blocked_result["winner_id"]
                return {
                    "success": True, 
                    "message": "Peça comprada", 
                    "piece": piece.to_dict(),
                    "game_blocked": True,
                    "winner": blocked_result["winner_name"]
                }

        return {"success": True, "message": "Peça comprada", "piece": piece.to_dict()}

    def pass_turn(self, player_id: str) -> Dict:
        """Jogador passa a vez"""
        if not self.game_started or self.game_finished:
            return {"success": False, "message": "Jogo não está em andamento"}

        if self.get_current_player_id() != player_id:
            return {"success": False, "message": "Não é seu turno"}

        # Incrementa contador de passes consecutivos
        self.consecutive_passes += 1
        
        # Passa a vez
        self.current_player_index = (self.current_player_index + 1) % 2
        
        # Se ambos jogadores passaram consecutivamente, verifica se jogo está bloqueado
        if self.consecutive_passes >= 2:
            blocked_result = self.check_game_blocked()
            if blocked_result["blocked"]:
                self.game_finished = True
                self.winner = blocked_result["winner_id"]
                return {
                    "success": True, 
                    "message": "Vez passada",
                    "game_blocked": True,
                    "winner": blocked_result["winner_name"]
                }

        return {"success": True, "message": "Vez passada"}

    def calculate_hand_points(self, player_id: str) -> int:
        """Calcula os pontos na mão de um jogador"""
        total = 0
        for piece in self.players[player_id]["hand"]:
            total += piece.left + piece.right
        return total

    def check_game_blocked(self) -> Dict:
        """Verifica se o jogo está bloqueado (ninguém pode jogar)"""
        if len(self.dominoes_pool) > 0:
            return {"blocked": False}
            
        # Verifica se algum jogador pode jogar
        for player_id in self.players:
            for piece in self.players[player_id]["hand"]:
                if self.can_play_piece(piece)[0]:
                    return {"blocked": False}
        
        # Jogo bloqueado - encontra vencedor pela menor pontuação
        min_points = float('inf')
        winner_id = None
        winner_name = None
        
        for player_id in self.players:
            points = self.calculate_hand_points(player_id)
            if points < min_points:
                min_points = points
                winner_id = player_id
                winner_name = self.players[player_id]["name"]
        
        return {
            "blocked": True, 
            "winner_id": winner_id, 
            "winner_name": winner_name,
            "points": min_points
        }

    def get_game_state(self, player_id: str) -> Dict:
        """Retorna o estado do jogo para um jogador específico"""
        if player_id not in self.players:
            return {}

        return {
            "room_code": self.room_code,
            "players": {
                pid: {
                    "name": pdata["name"],
                    "hand_count": len(pdata["hand"])
                }
                for pid, pdata in self.players.items()
            },
            "my_hand": [p.to_dict() for p in self.players[player_id]["hand"]],
            "board": [p.to_dict() for p in self.board],
            "current_player": self.get_current_player_id(),
            "game_started": self.game_started,
            "game_finished": self.game_finished,
            "winner": self.players[self.winner]["name"] if self.winner else None,
            "pool_count": len(self.dominoes_pool)
        }
