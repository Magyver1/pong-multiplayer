import { useState, useEffect, useRef } from 'react';
import { database } from './firebase';
import { ref, set, onValue, update } from 'firebase/database';

function App() {
  const canvasRef = useRef(null);
  const [gameMode, setGameMode] = useState('menu');
  const [difficulty, setDifficulty] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerNumber, setPlayerNumber] = useState(null);
  const [score, setScore] = useState({ player1: 0, player2: 0 });
  const [isWaiting, setIsWaiting] = useState(false);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const ballRef = useRef({ x: 300, y: 300, radius: 8, dx: 0, dy: 0 });
  const paddle1Ref = useRef({ x: 250, y: 550, width: 100, height: 15 });
  const paddle2Ref = useRef({ x: 250, y: 15, width: 100, height: 15 });

  const difficultySettings = {
    easy: { ballSpeed: 3, aiSpeed: 2, speedIncrease: 1.05, pointsPerLevel: 10 },
    medium: { ballSpeed: 4, aiSpeed: 3, speedIncrease: 1.1, pointsPerLevel: 7 },
    hard: { ballSpeed: 5, aiSpeed: 4, speedIncrease: 1.15, pointsPerLevel: 5 }
  };

  // Inicializar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxWidth = Math.min(window.innerWidth - 40, 600);
    const maxHeight = window.innerHeight * 0.6; // 60% de la altura de la ventana
    
    canvas.width = maxWidth;
    canvas.height = Math.min(maxHeight, maxWidth * 1.2);

    paddle1Ref.current = {
      x: canvas.width / 2 - 50,
      y: canvas.height - 30,
      width: 100,
      height: 15
    };

    paddle2Ref.current = {
      x: canvas.width / 2 - 50,
      y: 15,
      width: 100,
      height: 15
    };

    ballRef.current = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      radius: 8,
      dx: 0,
      dy: 0
    };
  }, [gameMode]);

  const handleMouseMove = (e) => {
    if (gameMode === 'menu' || isPaused) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - paddle1Ref.current.width / 2;
    paddle1Ref.current.x = Math.max(0, Math.min(x, canvas.width - paddle1Ref.current.width));
  };

  const createRoom = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setPlayerNumber(1);
    setIsWaiting(true);

    const canvas = canvasRef.current;
    const initialState = {
      paddle1: paddle1Ref.current,
      paddle2: paddle2Ref.current,
      ball: { x: canvas.width / 2, y: canvas.height / 2, radius: 8, dx: 4, dy: -4 },
      score1: 0,
      score2: 0,
      players: 1,
      gameStarted: false
    };

    set(ref(database, `rooms/${code}`), initialState);

    const roomRef = ref(database, `rooms/${code}`);
    onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.players === 2) {
        setIsWaiting(false);
        setGameMode('multiplayer');
      }
    });
  };

  const joinRoom = (code) => {
    const roomRef = ref(database, `rooms/${code}`);
    onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.players === 1) {
        setRoomCode(code);
        setPlayerNumber(2);
        setGameMode('multiplayer');
        update(ref(database, `rooms/${code}`), {
          players: 2,
          gameStarted: true
        });
      } else {
        alert('Sala no encontrada o llena');
      }
    });
  };

  const startSoloMode = (diff) => {
    setDifficulty(diff);
    setLives(3);
    setLevel(1);
    setScore({ player1: 0, player2: 0 });
    setGameOver(false);
    setGameMode('solo');
  };

  const startVsAI = (diff) => {
    setDifficulty(diff);
    setScore({ player1: 0, player2: 0 });
    setGameOver(false);
    setGameMode('vs-ai');
  };

  // Inicializar velocidad de la pelota cuando el juego comienza
  useEffect(() => {
    if ((gameMode === 'solo' || gameMode === 'vs-ai') && difficulty) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const settings = difficultySettings[difficulty];
      ballRef.current = {
        x: canvas.width / 2,
        y: canvas.height / 2,
        radius: 8,
        dx: settings.ballSpeed * (Math.random() > 0.5 ? 1 : -1),
        dy: -settings.ballSpeed
      };
    }
  }, [gameMode, difficulty]);

  // Game loop
  useEffect(() => {
    if (gameMode !== 'solo' && gameMode !== 'vs-ai' && gameMode !== 'multiplayer') return;
    if (isPaused || gameOver || isWaiting) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let animationId;

    const gameLoop = () => {
      ctx.fillStyle = '#0f3460';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dibujar paddle jugador (abajo)
      ctx.fillStyle = '#00ffff';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00ffff';
      ctx.fillRect(paddle1Ref.current.x, paddle1Ref.current.y, paddle1Ref.current.width, paddle1Ref.current.height);

      // Dibujar paddle oponente (arriba) solo en modos competitivos
      if (gameMode === 'vs-ai' || gameMode === 'multiplayer') {
        ctx.fillStyle = '#ff6b6b';
        ctx.shadowColor = '#ff6b6b';
        ctx.fillRect(paddle2Ref.current.x, paddle2Ref.current.y, paddle2Ref.current.width, paddle2Ref.current.height);
      }

      // Dibujar pelota
      ctx.beginPath();
      ctx.arc(ballRef.current.x, ballRef.current.y, ballRef.current.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.fill();
      ctx.shadowBlur = 0;

      // Actualizar pelota
      ballRef.current.x += ballRef.current.dx;
      ballRef.current.y += ballRef.current.dy;

      // Rebote en paredes laterales
      if (ballRef.current.x + ballRef.current.radius > canvas.width || 
          ballRef.current.x - ballRef.current.radius < 0) {
        ballRef.current.dx = -ballRef.current.dx;
      }

      // Rebote en techo (solo modo solo)
      if (gameMode === 'solo' && ballRef.current.y - ballRef.current.radius < 0) {
        ballRef.current.dy = -ballRef.current.dy;
      }

      // Colisión con paddle jugador (abajo)
      if (ballRef.current.y + ballRef.current.radius > paddle1Ref.current.y &&
          ballRef.current.x > paddle1Ref.current.x &&
          ballRef.current.x < paddle1Ref.current.x + paddle1Ref.current.width &&
          ballRef.current.dy > 0) {
        
        ballRef.current.dy = -Math.abs(ballRef.current.dy);
        const hitPos = (ballRef.current.x - paddle1Ref.current.x) / paddle1Ref.current.width;
        ballRef.current.dx = (hitPos - 0.5) * 10;

        if (gameMode === 'solo') {
          setScore(prev => {
            const newScore = prev.player1 + 1;
            
            // Sistema de niveles
            const settings = difficultySettings[difficulty];
            if (newScore % settings.pointsPerLevel === 0) {
              setLevel(prevLevel => {
                const newLevel = prevLevel + 1;
                ballRef.current.dx *= settings.speedIncrease;
                ballRef.current.dy *= settings.speedIncrease;
                return newLevel;
              });
            }
            
            return { ...prev, player1: newScore };
          });
        } else {
          setScore(prev => ({ ...prev, player1: prev.player1 + 1 }));
        }
      }

      // Colisión con paddle oponente (arriba)
      if ((gameMode === 'vs-ai' || gameMode === 'multiplayer') &&
          ballRef.current.y - ballRef.current.radius < paddle2Ref.current.y + paddle2Ref.current.height &&
          ballRef.current.x > paddle2Ref.current.x &&
          ballRef.current.x < paddle2Ref.current.x + paddle2Ref.current.width &&
          ballRef.current.dy < 0) {
        
        ballRef.current.dy = Math.abs(ballRef.current.dy);
        const hitPos = (ballRef.current.x - paddle2Ref.current.x) / paddle2Ref.current.width;
        ballRef.current.dx = (hitPos - 0.5) * 10;
        setScore(prev => ({ ...prev, player2: prev.player2 + 1 }));
      }

      // Pelota sale por abajo (pierde jugador)
      if (ballRef.current.y - ballRef.current.radius > canvas.height) {
        if (gameMode === 'solo') {
          setLives(prevLives => {
            const newLives = prevLives - 1;
            
            if (newLives === 0) {
              setGameOver(true);
            } else {
              // Mantener velocidad del nivel actual
              const settings = difficultySettings[difficulty];
              const currentSpeed = settings.ballSpeed * Math.pow(settings.speedIncrease, level - 1);
              ballRef.current = {
                x: canvas.width / 2,
                y: canvas.height / 2,
                radius: 8,
                dx: currentSpeed * (Math.random() > 0.5 ? 1 : -1),
                dy: -currentSpeed
              };
            }
            
            return newLives;
          });
        } else {
          setScore(prev => ({ ...prev, player2: prev.player2 + 1 }));
          ballRef.current = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: 8,
            dx: 4 * (Math.random() > 0.5 ? 1 : -1),
            dy: -4
          };
        }
      }

      // Pelota sale por arriba (pierde oponente)
      if ((gameMode === 'vs-ai' || gameMode === 'multiplayer') && 
          ballRef.current.y + ballRef.current.radius < 0) {
        setScore(prev => ({ ...prev, player1: prev.player1 + 1 }));
        ballRef.current = {
          x: canvas.width / 2,
          y: canvas.height / 2,
          radius: 8,
          dx: 4 * (Math.random() > 0.5 ? 1 : -1),
          dy: 4
        };
      }

      // IA movement
      if (gameMode === 'vs-ai' && difficulty) {
        const settings = difficultySettings[difficulty];
        const paddleCenter = paddle2Ref.current.x + paddle2Ref.current.width / 2;
        const diff = ballRef.current.x - paddleCenter;
        
        if (Math.abs(diff) > 5) {
          paddle2Ref.current.x += diff > 0 ? settings.aiSpeed : -settings.aiSpeed;
          paddle2Ref.current.x = Math.max(0, Math.min(paddle2Ref.current.x, canvas.width - paddle2Ref.current.width));
        }
      }

      animationId = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => cancelAnimationFrame(animationId);
  }, [gameMode, isPaused, gameOver, difficulty, level, isWaiting]);

  const renderScore = () => {
    if (gameMode === 'solo') {
      return (
        <div className="text-center mb-4">
          <div className="text-cyan-400 text-2xl">Puntos: {score.player1}</div>
          <div className="text-cyan-400 text-xl">Nivel: {level}</div>
          <div className="text-red-400 text-xl">❤️ x{lives}</div>
        </div>
      );
    } else if (gameMode === 'vs-ai' || gameMode === 'multiplayer') {
      return (
        <div className="flex justify-around mb-4 text-2xl">
          <div className="text-cyan-400">Tú: {score.player1}</div>
          <div className="text-red-400">Oponente: {score.player2}</div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
      {gameMode === 'menu' && (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full">
          <h1 className="text-5xl font-bold text-cyan-400 text-center mb-8 drop-shadow-lg">
            🎮 PONG PRO
          </h1>
          
          <div className="space-y-4">
            <button
              onClick={() => setGameMode('difficulty-solo')}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-bold py-4 px-6 rounded-xl transition transform hover:scale-105"
            >
              👤 1 JUGADOR
            </button>
            
            <button
              onClick={() => setGameMode('difficulty-vs')}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold py-4 px-6 rounded-xl transition transform hover:scale-105"
            >
              🤖 1 JUGADOR vs IA
            </button>
            
            <button
              onClick={() => setGameMode('multiplayer-menu')}
              className="w-full bg-pink-500 hover:bg-pink-600 text-slate-900 font-bold py-4 px-6 rounded-xl transition transform hover:scale-105"
            >
              👥 2 JUGADORES
            </button>
          </div>
        </div>
      )}

      {gameMode === 'difficulty-solo' && (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full">
          <h2 className="text-3xl font-bold text-cyan-400 text-center mb-6">
            Elige Dificultad
          </h2>
          <div className="space-y-4">
            <button onClick={() => startSoloMode('easy')} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl">
              😊 FÁCIL
            </button>
            <button onClick={() => startSoloMode('medium')} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-xl">
              😐 MEDIO
            </button>
            <button onClick={() => startSoloMode('hard')} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl">
              😈 DIFÍCIL
            </button>
            <button onClick={() => setGameMode('menu')} className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl">
              ← VOLVER
            </button>
          </div>
        </div>
      )}

      {gameMode === 'difficulty-vs' && (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full">
          <h2 className="text-3xl font-bold text-cyan-400 text-center mb-6">
            Elige Dificultad IA
          </h2>
          <div className="space-y-4">
            <button onClick={() => startVsAI('easy')} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl">
              😊 FÁCIL
            </button>
            <button onClick={() => startVsAI('medium')} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-xl">
              😐 MEDIO
            </button>
            <button onClick={() => startVsAI('hard')} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl">
              😈 DIFÍCIL
            </button>
            <button onClick={() => setGameMode('menu')} className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl">
              ← VOLVER
            </button>
          </div>
        </div>
      )}

      {gameMode === 'multiplayer-menu' && (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full">
          <h2 className="text-3xl font-bold text-cyan-400 text-center mb-6">
            Multijugador Online
          </h2>
          <div className="space-y-4">
            <button onClick={createRoom} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl">
              ➕ CREAR SALA
            </button>
            <div>
              <input
                type="text"
                placeholder="Código de sala"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-700 text-white p-3 rounded-xl mb-2"
                maxLength={6}
              />
              <button onClick={() => joinRoom(roomCode)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-xl">
                🚪 UNIRSE A SALA
              </button>
            </div>
            <button onClick={() => setGameMode('menu')} className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl">
              ← VOLVER
            </button>
          </div>
        </div>
      )}

      {isWaiting && (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full text-center">
          <h2 className="text-3xl font-bold text-cyan-400 mb-4">
            Esperando jugador...
          </h2>
          <p className="text-white text-xl mb-6">
            Código de sala: <span className="text-cyan-400 font-bold text-3xl">{roomCode}</span>
          </p>
          <p className="text-slate-400 mb-4">
            Comparte este código con tu amigo
          </p>
          <button 
            onClick={() => {
              setIsWaiting(false);
              setGameMode('multiplayer-menu');
              setRoomCode('');
            }} 
            className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-xl"
          >
            ← CANCELAR
          </button>
        </div>
      )}

      {(gameMode === 'solo' || gameMode === 'vs-ai' || gameMode === 'multiplayer') && !gameOver && (
        <div className="w-full max-w-2xl">
          {renderScore()}
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onTouchMove={(e) => {
              e.preventDefault();
              const touch = e.touches[0];
              handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
            }}
            className="border-4 border-cyan-400 rounded-xl shadow-2xl mx-auto block"
            style={{ touchAction: 'none' }}
          />
          <button
            onClick={() => {
              setGameMode('menu');
              setScore({ player1: 0, player2: 0 });
              setGameOver(false);
            }}
            className="mt-4 bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-xl mx-auto block"
          >
            ← MENÚ PRINCIPAL
          </button>
        </div>
      )}

      {gameOver && (
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-red-400 max-w-md w-full text-center">
          <h2 className="text-4xl font-bold text-red-400 mb-4">
            ¡GAME OVER!
          </h2>
          <p className="text-white text-2xl mb-2">Puntos: {score.player1}</p>
          <p className="text-white text-xl mb-6">Nivel: {level}</p>
          <button
            onClick={() => {
              setGameMode('menu');
              setGameOver(false);
              setLives(3);
              setLevel(1);
              setScore({ player1: 0, player2: 0 });
            }}
            className="bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-bold py-3 px-8 rounded-xl"
          >
            JUGAR DE NUEVO
          </button>
        </div>
      )}
    </div>
  );
}

export default App;