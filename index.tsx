import express, { Express } from 'express';
import cors from 'cors';
import http from 'http';
import { Socket } from 'socket.io';

const app: Express = express();

app.use(express.json());

app.use(
    cors({
        origin: 'http://192.168.11.145:3000',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
    })
);

const server = http.createServer(app);

const io = require('socket.io')(server, {
    cors: {
        origin: 'http://192.168.11.145:3000',
    },
});

enum Events {
    userConnect = 'connection',
    userDisconnect = 'disconnect',
    startGame = 'startGame',
    updateScoreToWin = 'updateScoreToWin',
    updateUserList = 'updateUserList',
    setUserScore = 'userScore',
    setGameStatus = 'gameStatus',
    setRoomGame = 'roomName',
    sentInitialLetter = 'initialLetter',
    resetScores = 'resetScores',
    showWinnerAlert = 'showWinnerAlert',
    checkLetter = 'checkLetter',
    resetLetters = 'resetLetters',
}

const users = new Map();
const userRooms = new Map();
const roomLetters = new Map<string, string[]>();

let winningUserId: string | null = null;
let gameStarted = false;
let userNicknames: string[] = [];

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

const giveNextLetterToUser = (socket: Socket, roomName: string) => {
    const user = users.get(socket.id);
    const letters = roomLetters.get(roomName);

    //console.log(roomLetters);

    if (user && letters && letters.length > 0) {
        const currentIndex = user.currentIndex || 0;
        const nextIndex = currentIndex % letters.length;
        const nextLetter = letters[nextIndex];
        user.currentIndex = nextIndex + 1;

        user.letterQueue.push(nextLetter);
        socket.emit(Events.sentInitialLetter, nextLetter);
        io.to(roomName).emit(
            Events.updateUserList,
            Array.from(users.values()).filter(user => user.roomName === roomName)
        );
    }
};

io.on(Events.userConnect, (socket: Socket) => {
    console.log(`Client ${socket.id} connected`);
    gameStarted = false;
    let winningScore = 20;

    socket.on(Events.startGame, (nickname: string, roomName: string) => {
        if (!roomName) {
            roomName = generateRoomId();
        }

        socket.on(Events.updateScoreToWin, (score: string) => {
            winningScore = parseInt(score);
            console.log(`Winning score updated to: ${winningScore}`);
        });

        socket.join(roomName);
        userRooms.set(socket.id, roomName);

        if (!roomLetters.has(roomName)) {
            const letters: string[] = [];
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

    socket.on(Events.checkLetter, (eventKey: string) => {
        const roomName = userRooms.get(socket.id);
        const user = users.get(socket.id);

        if (user && user.letterQueue && user.letterQueue.length > 0) {
            console.log(eventKey + ' ' + user.letterQueue[0]);
            console.log("Queue is: " + user.letterQueue);

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

                    const letters: string[] = [];

                    for (let i = 0; i < winningScore; i++) {
                        letters.push(getRandomLetter());
                    }

                    roomLetters.set(roomName, letters);

                    users.forEach((user) => {
                        if (user.roomName === roomName) {
                            user.letterQueue = [];
                        }
                    });

                    socket.on(Events.resetScores, (roomName: string) => {
                        const letters: string[] = [];

                        for (let i = 0; i < winningScore; i++) {
                            letters.push(getRandomLetter());
                        }

                        roomLetters.set(roomName, letters);

                        users.forEach((user) => {
                            if (user.roomName === roomName) {
                                user.score = 0;
                                user.currentIndex = 0;
                                user.letterQueue = [];
                                giveNextLetterToUser(socket, roomName);
                            }
                        });

                        winningUserId = null;

                        io.to(roomName).emit(Events.resetLetters, letters);
                    });
                } else {
                    if (user.letterQueue.length > 0) {
                        socket.emit(
                            Events.sentInitialLetter,
                            user.letterQueue[0]
                        );
                    }
                }

                io.to(roomName).emit(
                    Events.updateUserList,
                    Array.from(users.values()).filter(user => user.roomName === roomName)
                );
            }
        }
    });



});

server.listen(4000, () => {
    console.log('Server is running on port 4000');
});