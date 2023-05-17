// код должен быть выполнен в строгом режиме, что означает, требования при сборке проекта будут повышены,
// избежать рекомендаций или предупреждений при сборке не получится
'use strict';


// Этот код объявляет переменные CryptoJS, express, body-parser и WebSocket и импортирует
// соответствующие модули, чтобы они могли быть использованы в дальнейшем коде.
//     CryptoJS - это модуль для работы с криптографическими функциями, такими как шифрование и дешифрование.
//     express - это модуль для создания веб-приложений на Node.js. Он предоставляет множество методов и функций, которые облегчают создание веб-сервера и маршрутизацию запросов.
//     body-parser - это модуль для обработки данных в теле запроса, например, данные формы.
//     WebSocket - это модуль для создания веб-сокета, который позволяет браузерам и серверам обмениваться данными в режиме реального времени.
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require("body-parser");
var WebSocket = require("ws");


//Объявляются порты как для клиент-серверного соединения, так иP2P.
//Если  в  переменных  среды  заранее  заданных  значений  нет,  то используем стандартные.
var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;

//Добавим переменную сложности (кол-во нулей)
var difficulty = 4;


// используется для реализации сетевой логики, например, при создании пиринговой сети,
//     когда узлы должны знать друг о друге для обмена данными
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

class Block {
    constructor(index, previousHash, timestamp, data, hash, difficulty, nonce) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
        this.difficulty = difficulty;
        //nonce - число, которое будет каждый раз увеличиваться с каждой попыткой поиска подходящего хеша (тем самым мы каждый раз ищем все новое число, в котором хеш будет соответствовать требованиям
        this.nonce = nonce;
    }
}


//массив сокетов, через которые происходит обмен сообщениями между участниками сети
var sockets = [];
//типы сообщений, отправляемые между участниками сети
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};


//первый блок - генезис
var getGenesisBlock = () => {
    return new Block(0, "0", 1682839690, "RUT-MIIT first block", "8d9d5a7ff4a78042ea6737bf59c772f8ed27ef3c9b576eac1976c91aaf48d2de", 0, 0);
};
var blockchain = [getGenesisBlock()];


//создание и запуск веб сервера
var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
    app.post('/mineBlock', (req, res) => {
        // var newBlock = generateNextBlock(req.body.data);
        var newBlock = mineBlock(req.body.data);
        addBlock(newBlock);
        broadcast(responseLatestMsg());
        console.log('block added: ' + JSON.stringify(newBlock));
        res.send();
    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s=>s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};
// Сервер отвечает по следующим endpoint’ам:
//     /blocks -для получения списка блоков в цепочке блоков.
// /mineBlock -для майнинга (добычи) нового блока. При POST запросе сервер создает новый блок с данными, полученными от клиента, добавляет его в цепочку блоков с помощью функции addBlock() ио тправляет сообщение обновления всем узлам в сети.
// /peers-для получения списка узлов в сети.
// /addPeer-для добавления нового узла в сеть.
//     При POST запросе сервер подключается к указанному узлу и отправляет сообщение обновления всем узлам в сети.


var mineBlock = (blockData) =>{
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nonce = 0;
    var nextTimeStamp = new Date().getTime() / 1000;
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimeStamp, blockData, nonce);
    //проверка на соответствие требованию к хешу
    // while (nextHash.substring(0, difficulty) !== Array(difficulty + 1).join("0")){
    //     nonce++;
    //     nextTimeStamp = new Date().getTime() / 1000;
    //     nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimeStamp, blockData, nonce)
    //     console.log("\"index\":" + nextIndex + ", \"previousHash\":"+previousBlock.hash+"\"timestamp\":" + nextTimeStamp+",\"data\":" + blockData+
    //     ",\x1b[33mhash: " + nextHash + " \x1b[0m,"+"\difficulty\":"+difficulty+" \x1b[33mnonce: " + nonce + " \x1b[0m ");
    // }
    while(nextHash.substring(0, difficulty) !== previousBlock.hash.substring(previousBlock.hash.length-difficulty, previousBlock.hash.length) || (nextHash === previousBlock.hash)){
        nonce++;
        nextTimeStamp = new Date().getTime()/1000;
        nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimeStamp, blockData, nonce);
        console.log("\"index\":" + nextIndex + ", \"previousHash\":"+previousBlock.hash+"\"timestamp\":" + nextTimeStamp+",\"data\":" + blockData+
            ",\x1b[33mhash: " + nextHash + " \x1b[0m,"+"\difficulty\":"+difficulty+" \x1b[33mnonce: " + nonce + " \x1b[0m ");
    }
    return new Block(nextIndex, previousBlock.hash, nextTimeStamp, blockData, nextHash, difficulty, nonce);
}

//Далее создадим и запустим веб-сервер, используемый для обмена сообзениями между узлами в блокчейн-сети
var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);
};


//Проинициализируем и определим функции, используемые для обработки сообщений. Если ошибка - соединение закрывается, сокет удаляется,
// в противном случае сообщения обрабатываются
var initConnection = (ws) =>{
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) =>{
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type){
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockChainResponse(message);
                break;
        }
    });
};
var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};
var connectToPeers =(newPeers) =>{
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockChainResponse = (message) =>{
    var receivedBlocks = JSON.parse(message.data).sort((b1,b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length-1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index){
        console.log('blockchain possibly behind. We got ' + latestBlockHeld.index + ' Peer got: ' +
        latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash){
            console.log('We can append the received block to our chain');
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1){
            console.log('We have to query the chain from our peer');
            broadcast(queryAllMsg());
        } else{
            console.log('Received blockchain is longer than current blockchain');
            replaceChain(receivedBlocks);
        }
    } else{
        console.log('received blockchain is not longer than current blockchain. Do nothing');
    }
};

//Проинициализируем и определим функции, используемые для генерации блока, расчета хеша, добавления блока в цепочку и проверки блока.
//Для генерации блока нам необходимо знать хеш предыдущего блока. Мы всегда должны иметь возмрожность проверить, является ли блок допустимым

// var generateNextBlock =(blockData) => {
//     var previousBlock = getLatestBlock();
//     var nextIndex = previousBlock.index + 1;
//     var nextTimeStamp = new Date().getTime()/1000;
//     var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimeStamp, blockData);
//     return new Block(nextIndex, previousBlock.hash, nextTimeStamp, blockData, previousBlock.hash);
// };


//передача свойств для подсчета хеша
var calculateHashForBlock = (block) => {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.nonce);
};


//описание метода подсчета хеша
var calculateHash = (index, previousHash, timestamp, data, nonce) => {
    return CryptoJS.SHA512(index + previousHash + timestamp + data + nonce).toString();
};

var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())){
        blockchain.push(newBlock);
    }
};

var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index){
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash){
        console.log('invalid previousHash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash){
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    } else if (newBlock.hash === previousBlock.hash){
        console.log('Same hash for previous block and current block');
        return false;
    }
    return true;
};

//Реализуем функцию определения самой длинной цепочки и проверки ее на доступность
var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid');
    }
};

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())){
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++){
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i-1])){
            tempBlocks.push(blockchainToValidate[i]);
        } else{
            return false;
        }
    }
    return true;
};

//определим реализацию вспомогательных функций и запустим сервер

var getLatestBlock = () => blockchain[blockchain.length-1];
var queryChainLengthMsg = () => ({'type':MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type':MessageType.QUERY_ALL});
var responseChainMsg = () => ({
   'type':MessageType.RESPONSE_BLOCKCHAIN,
   'data':JSON.stringify(blockchain)
});

var responseLatestMsg = () => ({
    'type':MessageType.RESPONSE_BLOCKCHAIN,
    'data':JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();