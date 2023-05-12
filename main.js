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


// используется для реализации сетевой логики, например, при создании пиринговой сети,
//     когда узлы должны знать друг о друге для обмена данными
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];


// Этот  код определяет  класс  Block,  который  используется  для  создания объектов, представляющих блоки в блокчейн-сети.
// constructor(index,  previousHash,  timestamp,  data,  hash)  определяет конструктор класса, который принимает следующие аргументы:
// •index-число, представляющее индекс блока в цепочке блоков.
// •previousHash-строка,  представляющая  хеш  предыдущего  блока  в цепочке блоков.
// •timestamp-число, представляющее метку времени создания блока.
// •data-любые данные, которые будут сохранены в блоке.
// •hash-строка, представляющая уникальный хеш текущего блока.
class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash;
    }
}


//массив сокетов, через которые происходит обмен сообщениями между участниками сети
var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};


//первый блок - генезис
var getGenesisBlock = () => {
    return new Block(0, "0", 1682839690, "RUT-MIIT first block", "8d9d5a7ff4a78042ea6737bf59c772f8ed27ef3c9b576eac1976c91aaf48d2de");
};
var blockchain = [getGenesisBlock()];


//создание и запуск веб сервера
var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
    app.post('/mineBlock', (req, res) => {
        var newBlock = generateNextBlock(req.body.data);
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


//Далее создадим и запустим веб-сервер, используемый для обмена сообзениями между узлами в блокчейн-сети
var initP2PServer = () => {
    var sever = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);
};


//Проинициализируем и определим функции, используемые для обработки сообщений. Если ошибка - соединение закрывается, сокет удаляется,
// в противном случае сообщения обрабатываются