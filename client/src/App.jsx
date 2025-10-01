import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const DominoDots = ({ value }) => {
  const dotPatterns = {
    0: [],
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]
  };

  const dots = dotPatterns[value] || [];

  return (
    <div className="grid grid-cols-3 gap-1 p-2 w-12">
      {[0, 1, 2].map(row => (
        [0, 1, 2].map(col => {
          const hasDot = dots.some(([r, c]) => r === row && c === col);
          return (
            <div
              key={`${row}-${col}`}
              className={`w-2 h-2 rounded-full ${hasDot ? 'bg-gray-800' : 'bg-transparent'}`}
            />
          );
        })
      ))}
    </div>
  );
};

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
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [showSideChoice, setShowSideChoice] = useState(false);
  const [startingInfo, setStartingInfo] = useState(null);
  const [requiredDouble, setRequiredDouble] = useState(null);

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
      setStartingInfo(data.starting_info);
      setRequiredDouble(data.required_double);
      
      // Mensagem personalizada baseada em quem inicia
      if (data.starting_info) {
        setMessage(data.starting_info.message);
      } else {
        setMessage('Jogo iniciado! Boa sorte!');
      }
    });

    newSocket.on('game_update', (data) => {
      setMyHand(data.my_hand);
      setBoard(data.board);
      setCurrentPlayer(data.current_player);
      setPlayers(data.players);
      setPoolCount(data.pool_count);
      setStartingInfo(data.starting_info);
      setRequiredDouble(data.required_double);
      
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
      // Só volta ao menu se o jogo não estiver em andamento
      if (gameState !== 'playing') {
        setGameState('menu');
      }
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

  const playPiece = (piece, side) => {
    socket.emit('play_piece', {
      room_code: roomCode,
      left: piece.left,
      right: piece.right,
      side: side // 'left' ou 'right'
    });
    setSelectedPiece(null);
    setShowSideChoice(false);
  };

  const selectPiece = (piece) => {
    if (board.length === 0) {
      playPiece(piece, 'right');
      return;
    }
    
    const leftEnd = board[0].left;
    const rightEnd = board[board.length - 1].right;
    const canLeft = piece.left === leftEnd || piece.right === leftEnd;
    const canRight = piece.left === rightEnd || piece.right === rightEnd;
    
    if (canLeft && canRight) {
      setSelectedPiece(piece);
      setShowSideChoice(true);
    } else if (canLeft) {
      playPiece(piece, 'left');
    } else if (canRight) {
      playPiece(piece, 'right');
    }
  };

  const canPlayPiece = (piece) => {
    // Se é a primeira jogada e há uma dupla obrigatória
    if (board.length === 0 && requiredDouble !== null) {
      return piece.left === piece.right && piece.left === requiredDouble;
    }
    
    if (board.length === 0) return true;
    const leftEnd = board[0].left;
    const rightEnd = board[board.length - 1].right;
    return piece.left === leftEnd || piece.right === leftEnd || 
          piece.left === rightEnd || piece.right === rightEnd;
  };

  const buyFromPool = () => {
    socket.emit('buy_piece', { room_code: roomCode });
  };

  // useEffect para compra automática quando não pode jogar
  useEffect(() => {
    if (socket && isMyTurn() && gameState === 'playing') {
      // Se o tabuleiro está vazio, pode jogar qualquer peça
      if (board.length === 0) return;
      
      const canPlay = myHand.some(piece => canPlayPiece(piece));
      
      if (!canPlay) {
        if (poolCount > 0) {
          // Compra automaticamente se não pode jogar e há peças no pool
          const timer = setTimeout(() => buyFromPool(), 800);
          return () => clearTimeout(timer);
        } else {
          // Passa a vez automaticamente se não pode jogar e pool está vazio
          const timer = setTimeout(() => {
            socket.emit('pass_turn', { room_code: roomCode });
          }, 1000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [myHand, currentPlayer, poolCount, gameState, socket, roomCode, board]);

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
          <h1 className="text-4xl font-bold text-center mb-2 text-gray-800">Dominó da Hellen! 🤠</h1>
          <p className="text-center text-gray-600 mb-8">Venha ser um tonhão</p>

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
  const DominoPiece = ({ piece, onClick, disabled, isHorizontal = true, className = '' }) => {
    const containerClass = isHorizontal 
      ? 'w-20 h-10 flex-row' 
      : 'w-10 h-20 flex-col';
    
    return (
      <button
        onClick={() => onClick && onClick(piece)}
        disabled={disabled}
        className={`${containerClass} bg-white border-4 border-gray-800 rounded-lg flex items-center justify-around p-1 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 hover:shadow-xl cursor-pointer transform transition-all'
        } ${className}`}
      >
        <DominoDots value={piece.left} />
        <div className={isHorizontal ? 'w-0.5 h-full bg-gray-800' : 'h-0.5 w-full bg-gray-800'}></div>
        <DominoDots value={piece.right} />
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
                  {isMyTurn() ? 
                    (board.length === 0 && requiredDouble !== null ? 
                      `🎯 Jogue a dupla [${requiredDouble}|${requiredDouble}] para começar!` :
                      myHand.some(piece => canPlayPiece(piece)) ? 
                        '🟢 Seu turno! Escolha uma peça para jogar' : 
                        poolCount > 0 ? 
                          '🔄 Comprando peças automaticamente...' : 
                          '⏭️ Passando vez automaticamente...'
                    ) : 
                    '🔴 Aguardando oponente...'
                  }
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

            {startingInfo && board.length === 0 && (
              <div className="mt-2 p-3 bg-purple-100 border-2 border-purple-300 rounded-lg text-center">
                <p className="text-purple-800 font-semibold">
                  🎯 {startingInfo.message}
                </p>
                {startingInfo.highest_double !== undefined && (
                  <p className="text-purple-600 text-sm mt-1">
                    Maior peça dupla na mesa!
                  </p>
                )}
              </div>
            )}

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
          <div className="bg-green-800 rounded-lg shadow-lg p-6 mb-4 overflow-x-auto">
            <h3 className="text-white text-lg font-bold mb-4">Tabuleiro</h3>
            
            {board.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-white text-lg">Jogue a primeira peça!</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-0 justify-center min-h-[100px]">
                {board.map((piece, idx) => (
                  <DominoPiece key={idx} piece={piece} disabled isHorizontal={true} />
                ))}
              </div>
            )}
          </div>

          {/* Mão do Jogador */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-gray-800 text-lg font-bold mb-4">Sua Mão ({myHand.length} peças)</h3>
            
            <div className="flex flex-wrap gap-4 justify-center mb-4">
              {myHand.map((piece, idx) => {
                const isRequired = board.length === 0 && requiredDouble !== null && 
                                 piece.left === piece.right && piece.left === requiredDouble;
                const canPlay = canPlayPiece(piece);
                
                return (
                  <div key={idx} className="relative">
                    {isRequired && (
                      <div className="absolute -top-2 -right-2 z-10">
                        <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                          OBRIGATÓRIA!
                        </span>
                      </div>
                    )}
                    <DominoPiece
                      piece={piece}
                      onClick={selectPiece}
                      disabled={!isMyTurn() || gameState === 'finished' || !canPlay}
                      className={isRequired ? 'ring-4 ring-yellow-400 ring-opacity-75 animate-pulse' : ''}
                    />
                  </div>
                );
              })}
            </div>


          </div>

          {/* Modal de escolha de lado */}
          {showSideChoice && selectedPiece && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md">
                <h3 className="text-xl font-bold mb-4">Escolha o lado para jogar:</h3>
                <div className="flex gap-4 mb-4">
                  <DominoPiece piece={selectedPiece} disabled />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => playPiece(selectedPiece, 'left')}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg"
                  >
                    ⬅️ Lado Esquerdo
                  </button>
                  <button
                    onClick={() => playPiece(selectedPiece, 'right')}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg"
                  >
                    Lado Direito ➡️
                  </button>
                </div>
                <button
                  onClick={() => {
                    setSelectedPiece(null);
                    setShowSideChoice(false);
                  }}
                  className="w-full mt-2 text-gray-600 hover:text-gray-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default App;
