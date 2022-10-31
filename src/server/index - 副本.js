// 服务端
const WebSocketServer = require("ws").Server;
const path = require("path");
const fse = require("fs-extra");
const Tool = require("../tools/tools");

// 权限验证信息
const CLIENT_AUTH_TOKEN = '505857cad57769f4afc6703949432780';
// 服务端IP 端口
const host = Tool.getLocalIP();
const port = 8092;
let wss = null;

// 客户端列表
const clientMap = new Map();
// 文件列表
let fileList = [];
// 文件根目录
const FILE_DIR = path.resolve('D:/FilesPdf');
// 当前传输文件的信息
let file_info = new Object();


// 事件监听
function websocket_add_listener(ws, request) {
    console.log(`客户端 ${request.socket.remoteAddress} connected`);
    clientMap.set(request.socket.remoteAddress, ws);
    ws.on('close', function close(e) {
        console.log(`客户端 ${request.socket.remoteAddress} Disconnect ${e}`);
        clientMap.delete(request.socket.remoteAddress);
    });
    ws.on('error', function error(err) {
        console.log('监听错误 %s', err);
    });

    ws.on('message', async function message(data, isBinary) {
        if (!isBinary) {
            let message = data.toString();
            if (Tool.isJson(message)) {
                message = JSON.parse(message);
                console.log(message);
                if (message.action == 'start') {
                    // 获取要传输的文件信息列表
                    if (fileList.length == 0) {
                        Tool.scanFile(FILE_DIR, fileList);
                    }
                    // 检查是否无文件信息
                    if (fileList.length == 0) {
                        // 没有文件
                        ws.send(JSON.stringify({action: 'wait'}));
                        return;
                    }
                    let filePath = fileList[0];
                    file_info.name = path.basename(fileList[0]);
                    file_info.dir = path.dirname(fileList[0]);
                    file_info.md5 = await Tool.cryptoMd5File(filePath);
                    let state = fse.statSync(filePath);
                    file_info.size = state.size;
                    // 发送文件基本信息
                    ws.send(JSON.stringify({
                        action: 'ready',
                        ...file_info
                    }));
                } else if ('transfer' == message.action) {
                    if (Object.keys(file_info).length == 0) return;
                    if (message.start > message.end) return;
                    let data = Buffer.alloc(0);
                    // /** 读取 100 个字节长的文件的最后 10 个字节的示例：**/
                    // /** fs.createReadStream('sample.txt', { start: 90, end: 99 }) **/;
                    const readable = fse.createReadStream(`${file_info.dir}/${file_info.name}`, {
                        start: message.start,
                        end: message.end - 1,
                        highWaterMark: message.chunk || 65536
                    });
                    readable.on('error', (err) => {
                        console.log('Error %s', err.errno);
                    });
                    readable.on('data', (chunk) => {
                        console.log(`Received ${chunk.length} bytes of data.`);
                        data = Buffer.concat([data, chunk], data.length + chunk.length);
                    });
                    readable.on('close', () => {
                        // 文件读取完默认是暂停的状态，不会被关闭
                        readable.destroy();
                    });
                    readable.on('end', () => {
                        console.log('向客户端 %s 传输数据: %d--%d bytes', request.socket.remoteAddress, message.start, message.start + data.length);
                        ws.send(data, {isBinary: true});
                    });
                } else if ('delete' == message.action) {
                    fse.remove(`${file_info.dir}/${file_info.name}`).then(() => {
                        console.log(`删除已同步的文件${file_info.name}`);
                        fileList.splice(0, 1);
                        file_info = new Object();
                        setTimeout(() => {
                            // 1 秒之后继续下一个文件传输
                            ws.send(JSON.stringify({
                                action: 'next'
                            }));
                        }, 1000)
                    }).catch(err => {
                        console.error(err)
                    });
                }
            }
        }
    });
}

// 创建服务
function CreateWebsocketServer() {
    wss = new WebSocketServer({host: host, port: port, verifyClient: ClientAuthVerify});
    wss.on('connection', websocket_add_listener);
}

// 验证函数
function ClientAuthVerify(info) {
    // 客户端大于2直接拒绝
    if (clientMap.size > 2) return false;
    const url = new URL(`https://${host}:${port}${info.req.url}`);
    let token = url.searchParams.get('token');
    return CLIENT_AUTH_TOKEN === token;
}

try {
    CreateWebsocketServer();
    console.log(`服务端已启动 listen on ${host}:${port}`);
} catch (e) {
    console.log('Error: %s', e.error);
    wss = null;
    setTimeout(() => {
        CreateWebsocketServer();
    }, 2000);
}
