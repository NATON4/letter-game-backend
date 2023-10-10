"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: 'http://192.168.11.145:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));
const server = http_1.default.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: 'http://192.168.11.145:3000',
    },
});
var Events;
(function (Events) {
    Events["userConnect"] = "connection";
    Events["userDisconnect"] = "disconnect";
    Events["startGame"] = "startGame";
    Events["updateScoreToWin"] = "updateScoreToWin";
    Events["updateUserList"] = "updateUserList";
    Events["setUserScore"] = "userScore";
    Events["setGameStatus"] = "gameStatus";
    Events["setRoomGame"] = "roomName";
    Events["sentInitialLetter"] = "initialLetter";
    Events["resetScores"] = "resetScores";
    Events["showWinnerAlert"] = "showWinnerAlert";
    Events["checkLetter"] = "checkLetter";
    Events["resetLetters"] = "resetLetters";
    Events["resetGame"] = "resetGame";
    Events["joinRoom"] = "joinRoom";
})(Events || (Events = {}));
const users = new Map();
const userRooms = new Map();
const roomLetters = new Map();
let winningUserId = null;
let gameStarted = false;
let userNicknames = [];
let winningScore = 20; // Початкове значення
const getRandomLetter = () => {
    const alphabet = 'abcdefghiklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const randomIndex = Math.floor(Math.random() * alphabet.length);
    return alphabet[randomIndex];
};
const generateRoomId = () => {
    const oneCharNowMilliseconds = Date.now().toString().slice(-1);
    const nowMilliseconds = Date.now().toString().slice(-6);
    return `R${oneCharNowMilliseconds + nowMilliseconds}`;
};
const giveNextLetterToUser = (socket, roomName) => {
    const user = users.get(socket.id);
    const letters = roomLetters.get(roomName);
    if (letters) {
        const currentIndex = user.currentIndex || 0;
        const nextIndex = currentIndex % letters.length;
        const nextLetter = letters[nextIndex];
        user.currentIndex = nextIndex + 1;
        user.letterQueue.push(nextLetter);
        socket.emit(Events.sentInitialLetter, nextLetter);
        io.to(roomName).emit(Events.updateUserList, Array.from(users.values()).filter(user => user.roomName === roomName));
    }
};
io.on(Events.userConnect, (socket) => {
    console.log(`Client ${socket.id} connected`);
    gameStarted = false;
    socket.on(Events.startGame, (nickname, roomName) => {
        if (!roomName) {
            roomName = generateRoomId();
        }
        socket.on(Events.updateScoreToWin, (score) => {
            winningScore = parseInt(score);
            console.log(`Winning score updated to: ${winningScore}`);
        });
        socket.join(roomName);
        userRooms.set(socket.id, roomName);
        if (!roomLetters.has(roomName)) {
            const letters = [];
            for (let i = 0; i < winningScore; i++) {
                letters.push(getRandomLetter());
            }
            roomLetters.set(roomName, letters);
        }
        const user = { score: 0, nickname: nickname, roomName, letterQueue: [], currentIndex: 0 };
        users.set(socket.id, user);
        io.to(roomName).emit(Events.updateUserList, Array.from(users.values()).filter(user => user.roomName === roomName));
        gameStarted = true;
        socket.emit(Events.setGameStatus, gameStarted);
        giveNextLetterToUser(socket, roomName);
        socket.emit(Events.setRoomGame, roomName);
    });
    socket.emit(Events.setUserScore, users.has(socket.id) ? users.get(socket.id).score : 0);
    socket.emit(Events.setGameStatus, gameStarted);
    const resetGame = (roomName) => {
        io.to(roomName).emit(Events.resetGame);
    };
    socket.on(Events.resetScores, (roomName) => {
        console.log('-----------');
        const letters = [];
        for (let i = 0; i < winningScore; i++) {
            letters.push(getRandomLetter());
        }
        roomLetters.set(roomName, letters);
        users.forEach((user) => {
            if (user.roomName === roomName) {
                user.score = 0;
                user.currentIndex = 0;
                user.letterQueue = letters;
                giveNextLetterToUser(socket, roomName);
            }
        });
        winningUserId = null;
        io.to(roomName).emit(Events.resetLetters, letters);
        resetGame(roomName);
    });
    socket.on(Events.joinRoom, (roomName) => {
        if (roomName) {
            socket.join(roomName);
            userRooms.set(socket.id, roomName);
            const user = users.get(socket.id);
            socket.emit(Events.updateScoreToWin, winningScore);
            user.score = 0;
            user.letterQueue = [];
            user.currentIndex = 0;
            io.to(roomName).emit(Events.updateUserList, Array.from(users.values()).filter(user => user.roomName === roomName));
            gameStarted = true;
            socket.emit(Events.setGameStatus, gameStarted);
            giveNextLetterToUser(socket, roomName);
            socket.emit(Events.setRoomGame, roomName);
        }
    });
    socket.on(Events.checkLetter, (eventKey) => {
        const roomName = userRooms.get(socket.id);
        const user = users.get(socket.id);
        if (user && user.letterQueue) {
            if (user.score >= winningScore) {
                return;
            }
            if (eventKey === user.letterQueue[0]) {
                user.score += 1;
                user.letterQueue.shift();
                socket.emit(Events.setUserScore, user.score);
                giveNextLetterToUser(socket, roomName);
                if (user.score >= winningScore) {
                    winningUserId = socket.id;
                    io.to(roomName).emit(Events.showWinnerAlert, user.nickname);
                }
                else {
                    if (user.letterQueue.length > 0) {
                        socket.emit(Events.sentInitialLetter, user.letterQueue[0]);
                    }
                }
                io.to(roomName).emit(Events.updateUserList, Array.from(users.values()).filter(user => user.roomName === roomName));
            }
        }
    });
    socket.on(Events.userDisconnect, () => {
        const roomName = userRooms.get(socket.id);
        userRooms.delete(socket.id);
        users.delete(socket.id);
        if (roomName) {
            io.to(roomName).emit(Events.updateUserList, Array.from(users.values()).filter(user => user.roomName === roomName));
            if (users.size === 0) {
                roomLetters.delete(roomName);
            }
        }
    });
});
server.listen(4000, () => {
    console.log('Server is running on port 4000');
});
