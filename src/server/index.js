// 服务端
const WebSocketServer = require("ws").Server;
const moment = require("moment");
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
// 存储盘根目录
const ROOT_DIR = path.resolve('F:\\');
// 当前传输文件的信息
let file_info = new Object();
// 每次读取1M
const chunkSize = 1048576;
let start_bytes = 0;
let end_bytes = 0;


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
                let {action, name, size, md5, dir} = JSON.parse(message);

                if ('ready' == action) {
                    // 服务器准备完成
                    ws.send(JSON.stringify({action: 'start'}));
                } else if ('start' == action) {
                    // 开始
                    let parse = path.parse(`${dir}/${name}`);
                    file_info = {
                        name,
                        size,
                        md5,
                        dir: dir.replace(parse.root, ROOT_DIR)
                    };
                    // 创建目录
                    fse.ensureDirSync(file_info.dir);
                    // 断点续传
                    if (fse.pathExistsSync(`${file_info.dir}/${name}`)) {
                        let state = fse.statSync(`${file_info.dir}/${name}`);
                        if (state.size == size) {
                            console.log("文件已经传递", name);
                            setTimeout(() => {
                                ws.send(JSON.stringify({action: 'complete', name: name, time: Date.now()}));
                            }, 1000);
                            return;
                        } else {
                            // 偏移量
                            start_bytes = state.size;
                            console.log("断点传输", start_bytes);
                        }
                    } else {
                        start_bytes = 0;
                    }

                    end_bytes = (start_bytes + chunkSize) > size ? size : start_bytes + chunkSize;
                    console.log('================>开始同步下一个文件');
                    console.log('文件信息：%s', file_info);
                    // 开始获取文件数据
                    ws.send(JSON.stringify({
                        action: 'transfer', start: start_bytes, end: end_bytes, chunk: chunkSize
                    }));
                } else if ('next' == action) {
                    ws.send(JSON.stringify({
                        action: 'start', time: Date.now()
                    }));
                } else if ('wait' == action) {
                    // 暂无文件 定时重新开始
                    console.log('暂无需要同步的文件 %s', moment().format("YYYY-MM-DD HH:mm:ss"));
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            action: 'start', time: Date.now()
                        }));
                    }, 15000);
                }
            }
        } else {
            handleBinaryMessage(data, ws);
        }
    });
}

/**
 * 二进制数据
 * @param data 数据
 * @param ws 连接
 */
function handleBinaryMessage(data, ws) {
    if (data.length > 0) {
        // 创建可写流 打开文件进行追加。 如果文件不存在，则创建该文件
        let writeable = fse.createWriteStream(`${file_info.dir}/${file_info.name}`, {flags: 'a'});
        writeable.on('open', () => {
            writeable.write(data);
            writeable.end();
        });
        writeable.on('error', (err) => {
            console.log(err);
        });
        writeable.on('finish', async () => {
            console.log('分片写入完成 %d--%d bytes, 传输进度: %f%', start_bytes, end_bytes, (end_bytes / file_info.size * 100).toFixed(2));
            if (end_bytes == file_info.size) {
                console.log("文件内容全部写入完毕 %s \r", file_info.name);
                // 检查文件是否完整
                let file_md5 = await Tool.cryptoMd5File(`${file_info.dir}/${file_info.name}`);
                if (file_md5 == file_info.md5) {
                    // 同步下一个文件
                    setTimeout(() => {
                        ws.send(JSON.stringify({
                            action: 'complete', name: file_info.name, time: Date.now()
                        }));
                    }, 1000);
                    file_info = {};
                }
            } else {
                if (start_bytes + chunkSize >= file_info.size) {
                    start_bytes = end_bytes;
                } else {
                    start_bytes += chunkSize;
                }
                end_bytes = (start_bytes + chunkSize) >= file_info.size ? file_info.size : start_bytes + chunkSize;
                // 读取下一个片段
                ws.send(JSON.stringify({
                    action: 'transfer', start: start_bytes, end: end_bytes, chunk: chunkSize
                }));
            }
        });
    }
}

// 创建服务
function CreateWebsocketServer() {
    wss = new WebSocketServer({host: host, port: port, verifyClient: ClientAuthVerify});
    wss.on('connection', websocket_add_listener);
}

// 验证函数
function ClientAuthVerify(info) {
    // 客户端大于0直接拒绝
    if (clientMap.size > 0) return false;
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
