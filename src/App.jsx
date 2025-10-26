import { useState, useEffect, useRef } from 'react';
import { database } from './firebase';
import { ref, set, onValue, update, off } from 'firebase/database';

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
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [winner, setWinner] = useState(null);

  const ballRef = useRef({ x: 300, y: 300, radius: 8, dx: 0, dy: 0 });
  const paddle1Ref = useRef({ x: 250, y: 550, width: 100, height: 15 });
  const paddle2Ref = useRef({ x: 250, y: 15, width: 100, height: 15 });
  const particlesRef = useRef([]);
  const audioContextRef = useRef(null);
  const roomRefListener = useRef(null);

  const difficultySettings = {
    easy: { ballSpeed: 3, aiSpeed: 2, speedIncrease: 1.05, pointsPerLevel: 10 },
    medium: { ballSpeed: 4, aiSpeed: 3, speedIncrease: 1.1, pointsPerLevel: 7 },
    hard: { ballSpeed: 5, aiSpeed: 4, speedIncrease: 1.15, pointsPerLevel: 5 }
  };

  // Inicializar AudioContext
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
  }, []);

  // Sonidos
  const playSound = (frequency, duration, type = 'sine') => {
    if (!audioContextRef.current) return;
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.3, audioContextRef.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration);
    
    oscillator.start(audioContextRef.current.currentTime);
    oscillator.stop(audioContextRef.current.currentTime + duration);
  };

  // Crear partículas
  const createParticles = (x, y, color, count = 15) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x: x,
        y: y,
        dx: (Math.random() - 0.5) * 8,
        dy: (Math.random() - 0.5) * 8,
        life: 1,
        color: color
      });
    }
  };

  // Actualizar partículas
  const updateParticles = () => {
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    particlesRef.current.forEach(p => {
      p.x += p.dx;
      p.y += p.dy;
      p.life -= 0.02;
      p.dy += 0.3;
    });
  };

  // Dibujar partículas
  const drawParticles = (ctx) => {
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1;
  };

  // Inicializar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxWidth = Math.min(window.innerWidth - 40, 600);
    const maxHeight = window.innerHeight * 0.6;
    
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
    const newX = Math.max(0, Math.min(x, canvas.width - paddle1Ref.current.width));
    
    paddle1Ref.current.x = newX;

    // Sincronizar con Firebase en modo multijugador
    if (gameMode === 'multiplayer' && roomCode && playerNumber) {
      const paddleKey = `paddle${playerNumber}X`;
      update(ref(database, `rooms/${roomCode}`), {
        [paddleKey]: newX
      });
    }
  };

  const togglePause = () => {
    if (gameMode === 'menu') return;
    setIsPaused(!isPaused);
    setShowPauseMenu(!showPauseMenu);
  };

  const createRoom = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setPlayerNumber(1);
    setIsWaiting(true);

    const canvas = canvasRef.current;
    const initialState = {
      paddle1X: canvas.width / 2 - 50,
      paddle2X: canvas.width / 2 - 50,
      ballX: canvas.width / 2,
      ballY: canvas.height / 2,
      ballDx: 4,
      ballDy: -4,
      score1: 0,
      score2: 0,
      players: 1,
      gameStarted: false,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    };

    set(ref(database, `rooms/${code}`), initialState);

    roomRefListener.current = ref(database, `rooms/${code}`);
    onValue(roomRefListener.current, (snapshot) => {
      const data = snapshot.val();
      if (data && data.players === 2 && !data.gameStarted) {
        setIsWaiting(false);
        update(ref(database, `rooms/${code}`), { gameStarted: true });
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
        setIsWaiting(false);
        update(ref(database, `rooms/${code}`), {
          players: 2,
          gameStarted: true
        });
        setGameMode('multiplayer');
      } else {
        alert('Sala no encontrada o llena');
      }
    }, { onlyOnce: true });
  };

  const startSoloMode = (diff) => {
    setDifficulty(diff);
    setLives(3);
    setLevel(1);
    setScore({ player1: 0, player2: 0 });
    setGameOver(false);
    setWinner(null);
    setGameMode('solo');
  };

  const startVsAI = (diff) => {
    setDifficulty(diff);
    setScore({ player1: 0, player2: 0 });
    setGameOver(false);
    setWinner(null);
    setGameMode('vs-ai');
  };

  // Inicializar velocidad de la pelota
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

  // Sincronizar multijugador
  useEffect(() => {
    if (gameMode !== 'multiplayer' || !roomCode) return;

    const roomRef = ref(database, `rooms/${roomCode}`);
    
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Actualizar posiciones
      if (playerNumber === 1) {
        paddle2Ref.current.x = data.paddle2X || paddle2Ref.current.x;
      } else {
        paddle1Ref.current.x = data.paddle1X || paddle1Ref.current.x;
      }

      ballRef.current.x = data.ballX;
      ballRef.current.y = data.ballY;
      ballRef.current.dx = data.ballDx;
      ballRef.current.dy = data.ballDy;

      setScore({ player1: data.score1, player2: data.score2 });

      // Verificar ganador
      if (data.score1 >= 10) {
        setWinner(1);
        setGameOver(true);
      } else if (data.score2 >= 10) {
        setWinner(2);
        setGameOver(true);
      }
    });

    return () => {
      off(roomRef);
    };
  }, [gameMode, roomCode, playerNumber]);

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

      // Línea central (solo en modos competitivos)
      if (gameMode === 'vs-ai' || gameMode === 'multiplayer') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Dibujar paddle jugador
      const myPaddleY = gameMode === 'multiplayer' && playerNumber === 2 ? paddle2Ref.current.y : paddle1Ref.current.y;
      const myPaddleX = gameMode === 'multiplayer' && playerNumber === 2 ? paddle2Ref.current.x : paddle1Ref.current.x;
      
      ctx.fillStyle = '#00ffff';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00ffff';
      
      if (gameMode === 'multiplayer' && playerNumber === 2) {
        // Invertir vista para jugador 2
        ctx.fillRect(myPaddleX, canvas.height - 30, paddle1Ref.current.width, paddle1Ref.current.height);
      } else {
        ctx.fillRect(myPaddleX, myPaddleY, paddle1Ref.current.width, paddle1Ref.current.height);
      }

      // Dibujar paddle oponente
      if (gameMode === 'vs-ai' || gameMode === 'multiplayer') {
        const oppPaddleY = gameMode === 'multiplayer' && playerNumber === 2 ? canvas.height - 30 : paddle2Ref.current.y;
        const oppPaddleX = gameMode === 'multiplayer' && playerNumber === 2 ? paddle1Ref.current.x : paddle2Ref.current.x;
        
        ctx.fillStyle = '#ff6b6b';
        ctx.shadowColor = '#ff6b6b';
        
        if (gameMode === 'multiplayer' && playerNumber === 2) {
          ctx.fillRect(oppPaddleX, paddle2Ref.current.y, paddle2Ref.current.width, paddle2Ref.current.height);
        } else {
          ctx.fillRect(oppPaddleX, oppPaddleY, paddle2Ref.current.width, paddle2Ref.current.height);
        }
      }

      // Dibujar pelota
      let displayBallY = ballRef.current.y;
      if (gameMode === 'multiplayer' && playerNumber === 2) {
        displayBallY = canvas.height - ballRef.current.y;
      }
      
      ctx.beginPath();
      ctx.arc(ballRef.current.x, displayBallY, ballRef.current.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ffff00';
      ctx.shadowColor = '#ffff00';
      ctx.fill();
      ctx.shadowBlur = 0;

      // Solo el host actualiza la pelota en multijugador
      if (gameMode === 'multiplayer' && playerNumber !== 1) {
        updateParticles();
        drawParticles(ctx);
        animationId = requestAnimationFrame(gameLoop);
        return;
      }

      // Actualizar pelota
      ballRef.current.x += ballRef.current.dx;
      ballRef.current.y += ballRef.current.dy;

      // Rebote en paredes laterales
      if (ballRef.current.x + ballRef.current.radius > canvas.width || 
          ballRef.current.x - ballRef.current.radius < 0) {
        ballRef.current.dx = -ballRef.current.dx;
        playSound(200, 0.1);
        createParticles(ballRef.current.x, ballRef.current.y, '#00ffff', 8);
      }

      // Rebote en techo (solo modo solo)
      if (gameMode === 'solo' && ballRef.current.y - ballRef.current.radius < 0) {
        ballRef.current.dy = -ballRef.current.dy;
        playSound(200, 0.1);
        createParticles(ballRef.current.x, ballRef.current.y, '#00ffff', 8);
      }

      // Colisión con paddle jugador
      if (ballRef.current.y + ballRef.current.radius > paddle1Ref.current.y &&
          ballRef.current.x > paddle1Ref.current.x &&
          ballRef.current.x < paddle1Ref.current.x + paddle1Ref.current.width &&
          ballRef.current.dy > 0) {
        
        ballRef.current.dy = -Math.abs(ballRef.current.dy);
        const hitPos = (ballRef.current.x - paddle1Ref.current.x) / paddle1Ref.current.width;
        ballRef.current.dx = (hitPos - 0.5) * 10;
        
        playSound(440, 0.15);
        createParticles(ballRef.current.x, ballRef.current.y, '#00ffff', 10);

        if (gameMode === 'solo') {
          setScore(prev => {
            const newScore = prev.player1 + 1;
            const settings = difficultySettings[difficulty];
            
            if (newScore % settings.pointsPerLevel === 0) {
              setLevel(prevLevel => {
                const newLevel = prevLevel + 1;
                ballRef.current.dx *= settings.speedIncrease;
                ballRef.current.dy *= settings.speedIncrease;
                playSound(523, 0.3);
                return newLevel;
              });
            }
            
            return { ...prev, player1: newScore };
          });
        } else if (gameMode === 'multiplayer') {
          const newScore1 = score.player1 + 1;
          update(ref(database, `rooms/${roomCode}`), { score1: newScore1 });
        } else {
          setScore(prev => ({ ...prev, player1: prev.player1 + 1 }));
        }
      }

      // Colisión con paddle oponente
      if ((gameMode === 'vs-ai' || gameMode === 'multiplayer') &&
          ballRef.current.y - ballRef.current.radius < paddle2Ref.current.y + paddle2Ref.current.height &&
          ballRef.current.x > paddle2Ref.current.x &&
          ballRef.current.x < paddle2Ref.current.x + paddle2Ref.current.width &&
          ballRef.current.dy < 0) {
        
        ballRef.current.dy = Math.abs(ballRef.current.dy);
        const hitPos = (ballRef.current.x - paddle2Ref.current.x) / paddle2Ref.current.width;
        ballRef.current.dx = (hitPos - 0.5) * 10;
        
        playSound(440, 0.15);
        createParticles(ballRef.current.x, ballRef.current.y, '#ff6b6b', 10);
        
        if (gameMode === 'multiplayer') {
          const newScore2 = score.player2 + 1;
          update(ref(database, `rooms/${roomCode}`), { score2: newScore2 });
        } else {
          setScore(prev => ({ ...prev, player2: prev.player2 + 1 }));
        }
      }

      // Pelota sale por abajo
      if (ballRef.current.y - ballRef.current.radius > canvas.height) {
        playSound(100, 0.5, 'sawtooth');
        createParticles(ballRef.current.x, canvas.height, '#ff6b6b', 30);
        
        if (gameMode === 'solo') {
          setLives(prevLives => {
            const newLives = prevLives - 1;
            
            if (newLives === 0) {
              setGameOver(true);
            } else {
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
        } else if (gameMode === 'multiplayer') {
          const newScore2 = score.player2 + 1;
          ballRef.current = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: 8,
            dx: 4 * (Math.random() > 0.5 ? 1 : -1),
            dy: -4
          };
          update(ref(database, `rooms/${roomCode}`), {
            score2: newScore2,
            ballX: ballRef.current.x,
            ballY: ballRef.current.y,
            ballDx: ballRef.current.dx,
            ballDy: ballRef.current.dy
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

      // Pelota sale por arriba
      if ((gameMode === 'vs-ai' || gameMode === 'multiplayer') && 
          ballRef.current.y + ballRef.current.radius < 0) {
        playSound(100, 0.5, 'sawtooth');
        createParticles(ballRef.current.x, 0, '#00ffff', 30);
        
        if (gameMode === 'multiplayer') {
          const newScore1 = score.player1 + 1;
          ballRef.current = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: 8,
            dx: 4 * (Math.random() > 0.5 ? 1 : -1),
            dy: 4
          };
          update(ref(database, `rooms/${roomCode}`), {
            score1: newScore1,
            ballX: ballRef.current.x,
            ballY: ballRef.current.y,
            ballDx: ballRef.current.dx,
            ballDy: ballRef.current.dy
          });
        } else {
          setScore(prev => ({ ...prev, player1: prev.player1 + 1 }));
          ballRef.current = {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: 8,
            dx: 4 * (Math.random() > 0.5 ? 1 : -1),
            dy: 4
          };
        }
      }

      // Actualizar posición en Firebase (multiplayer)
      if (gameMode === 'multiplayer' && playerNumber === 1) {
        update(ref(database, `rooms/${roomCode}`), {
          ballX: ballRef.current.x,
          ballY: ballRef.current.y,
          ballDx: ballRef.current.dx,
          ballDy: ballRef.current.dy
        });
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

      updateParticles();
      drawParticles(ctx);

      animationId = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => cancelAnimationFrame(animationId);
  }, [gameMode, isPaused, gameOver, difficulty, level, isWaiting, roomCode, playerNumber, score]);

  const renderScore = () => {
    if (gameMode === 'solo') {
      return (
        <div className="text-center mb-4 space-y-2">
          <div className="flex justify-center gap-8">
            <div className="text-cyan-400 text-2xl font-bold">
              Puntos: <span className="text-3xl">{score.player1}</span>
            </div>
            <div className="text-yellow-400 text-2xl font-bold">
              Nivel: <span className="text-3xl">{level}</span>
            </div>
          </div>
          <div className="text-red-400 text-2xl font-bold drop-shadow-lg">
            ❤️ x{lives}
          </div>
        </div>
      );
    } else if (gameMode === 'vs-ai' || gameMode === 'multiplayer') {
      return (
        <div className="flex justify-around mb-4 text-2xl font-bold">
          <div className="text-cyan-400 drop-shadow-lg">
            Tú: <span className="text-3xl">{score.player1}</span>
          </div>
          <div className="text-red-400 drop-shadow-lg">
            Oponente: <span className="text-3xl">{score.player2}</span>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex flex-col items-center justify-center p-4">
      {gameMode === 'menu' && (
        <div className="bg-slate-800/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full animate-pulse-slow">
          <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 text-center mb-8 drop-shadow-2xl animate-glow">
            🎮 PONG PRO
          </h1>
          
          <div className="space-y-4">
            <button
              onClick={() => setGameMode('difficulty-solo')}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold py-4 px-6 rounded-xl transition transform hover:scale-105 shadow-lg hover:shadow-cyan-500/50"
            >
              👤 1 JUGADOR
            </button>
            
            <button
              onClick={() => setGameMode('difficulty-vs')}
              className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-bold py-4 px-6 rounded-xl transition transform hover:scale-105 shadow-lg hover:shadow-yellow-500/50"
            >
              🤖 1 JUGADOR vs IA
            </button>
            
            <button
              onClick={() => setGameMode('multiplayer-menu')}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-bold py-4 px-6 rounded-xl transition transform hover:scale-105 shadow-lg hover:shadow-pink-500/50"
            >
              👥 2 JUGADORES
            </button>
          </div>
        </div>
      )}

      {gameMode === 'difficulty-solo' && (
        <div className="bg-slate-800/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full">
          <h2 className="text-4xl font-bold text-cyan-400 text-center mb-6 drop-shadow-lg">
            Elige Dificultad
          </h2>
          <div className="space-y-4">
            <button onClick={() => startSoloMode('easy')} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
              😊 FÁCIL
            </button>
            <button onClick={() => startSoloMode('medium')} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
              😐 MEDIO
            </button>
            <button onClick={() => startSoloMode('hard')} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
              😈 DIFÍCIL
            </button>
            <button onClick={() => setGameMode('menu')} className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl transition">
              ← VOLVER
            </button>
          </div>
        </div>
      )}

      {gameMode === 'difficulty-vs' && (
        <div className="bg-slate-800/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full">
          <h2 className="text-4xl font-bold text-cyan-400 text-center mb-6 drop-shadow-lg">
            Elige Dificultad IA
          </h2>
          <div className="space-y-4">
            <button onClick={() => startVsAI('easy')} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
              😊 FÁCIL
            </button>
            <button onClick={() => startVsAI('medium')} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
              😐 MEDIO
            </button>
            <button onClick={() => startVsAI('hard')} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
              😈 DIFÍCIL
            </button>
            <button onClick={() => setGameMode('menu')} className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl transition">
              ← VOLVER
            </button>
          </div>
        </div>
      )}

      {gameMode === 'multiplayer-menu' && (
        <div className="bg-slate-800/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full">
          <h2 className="text-4xl font-bold text-cyan-400 text-center mb-6 drop-shadow-lg">
            Multijugador Online
          </h2>
          <div className="space-y-4">
            <button onClick={createRoom} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
              ➕ CREAR SALA
            </button>
            <div>
              <input
                type="text"
                placeholder="Código de sala"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-700 text-white p-3 rounded-xl mb-2 border-2 border-slate-600 focus:border-cyan-400 outline-none"
                maxLength={6}
              />
              <button onClick={() => joinRoom(roomCode)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition transform hover:scale-105">
                🚪 UNIRSE A SALA
              </button>
            </div>
            <button onClick={() => setGameMode('menu')} className="w-full bg-slate-600 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl transition">
              ← VOLVER
            </button>
          </div>
        </div>
      )}

      {isWaiting && (
        <div className="bg-slate-800/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full text-center">
          <h2 className="text-4xl font-bold text-cyan-400 mb-4 animate-pulse">
            Esperando jugador...
          </h2>
          <p className="text-white text-xl mb-6">
            Código de sala:
          </p>
          <div className="text-cyan-400 font-bold text-5xl mb-6 tracking-widest animate-pulse bg-slate-700 py-4 rounded-xl">
            {roomCode}
          </div>
          <p className="text-slate-400 mb-6">
            Comparte este código con tu amigo
          </p>
          <button 
            onClick={() => {
              setIsWaiting(false);
              setGameMode('multiplayer-menu');
              setRoomCode('');
            }} 
            className="bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-xl transition"
          >
            ← CANCELAR
          </button>
        </div>
      )}

      {(gameMode === 'solo' || gameMode === 'vs-ai' || gameMode === 'multiplayer') && !gameOver && (
        <div className="w-full max-w-2xl">
          {renderScore()}
          <div className="relative">
            <button
              onClick={togglePause}
              className="absolute top-2 right-2 z-10 bg-slate-800/80 backdrop-blur-sm hover:bg-slate-700 text-cyan-400 w-12 h-12 rounded-full font-bold text-xl shadow-lg border-2 border-cyan-400 transition"
            >
              {isPaused ? '▶' : '⏸'}
            </button>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onTouchMove={(e) => {
                e.preventDefault();
                const touch = e.touches[0];
                handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
              }}
              className="border-4 border-cyan-400 rounded-xl shadow-2xl mx-auto block bg-gradient-to-b from-blue-900/50 to-slate-900/50"
              style={{ touchAction: 'none' }}
            />
          </div>
          <button
            onClick={() => {
              setGameMode('menu');
              setScore({ player1: 0, player2: 0 });
              setGameOver(false);
              setIsPaused(false);
              setShowPauseMenu(false);
            }}
            className="mt-4 bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-xl mx-auto block transition"
          >
            ← MENÚ PRINCIPAL
          </button>
        </div>
      )}

      {showPauseMenu && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-cyan-400 max-w-md w-full text-center">
            <h2 className="text-4xl font-bold text-cyan-400 mb-6">⏸ PAUSA</h2>
            <p className="text-white text-xl mb-6">El juego está pausado</p>
            <div className="space-y-4">
              <button onClick={togglePause} className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-3 px-6 rounded-xl transition">
                ▶ CONTINUAR
              </button>
              <button 
                onClick={() => {
                  setGameMode('menu');
                  setScore({ player1: 0, player2: 0 });
                  setGameOver(false);
                  setIsPaused(false);
                  setShowPauseMenu(false);
                }} 
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition"
              >
                🏠 MENÚ PRINCIPAL
              </button>
            </div>
          </div>
        </div>
      )}

      {gameOver && (
        <div className="bg-slate-800/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border-4 border-red-400 max-w-md w-full text-center">
          <h2 className="text-5xl font-bold text-red-400 mb-6 drop-shadow-lg">
            {gameMode === 'multiplayer' ? (
              winner === playerNumber ? '🎉 ¡GANASTE!' : '😢 PERDISTE'
            ) : (
              '¡GAME OVER!'
            )}
          </h2>
          
          {gameMode === 'solo' && (
            <>
              <p className="text-white text-3xl mb-2">Puntos: <span className="text-cyan-400 font-bold">{score.player1}</span></p>
              <p className="text-white text-2xl mb-6">Nivel alcanzado: <span className="text-yellow-400 font-bold">{level}</span></p>
            </>
          )}
          
          {(gameMode === 'vs-ai' || gameMode === 'multiplayer') && (
            <div className="mb-6">
              <p className="text-white text-2xl mb-2">Puntuación Final:</p>
              <div className="flex justify-around text-3xl font-bold">
                <div className="text-cyan-400">Tú: {score.player1}</div>
                <div className="text-red-400">Oponente: {score.player2}</div>
              </div>
            </div>
          )}
          
          <button
            onClick={() => {
              setGameMode('menu');
              setGameOver(false);
              setLives(3);
              setLevel(1);
              setScore({ player1: 0, player2: 0 });
              setWinner(null);
              setIsPaused(false);
              setShowPauseMenu(false);
            }}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition transform hover:scale-105"
          >
            🎮 JUGAR DE NUEVO
          </button>
        </div>
      )}
    </div>
  );
}

export default App;