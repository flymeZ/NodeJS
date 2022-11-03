// 客户端===终端
const WebSocket = require("ws");
const moment = require("moment");
const Tool = require("../tools/tools");
const path = require("path");
const fse = require("fs-extra");

const host = Tool.getLocalIP();
const port = 8092;
let client = null;
// 文件列表
let fileList = [];
// 文件根目录
const FILE_DIR = path.resolve('F:/Data Manager');
// 文件已同步目录
const SYNED_DIR = path.resolve('F:/Data Manager_Syned');
// 当前传输文件的信息
let file_info = new Object();
// 每次读取1M
const chunkSize = 1048576;
let start_bytes = 0;
let end_bytes = 0;

// 创建客户端
function CreateWebsocketClient() {
    try {
        client = new WebSocket(`ws://${host}:${port}?token=505857cad57769f4afc6703949432780`);
        client.on("open", function open() {
            console.log("客户端已打开,准备同步文件 delay 5s");
            sendToServer({
                action: 'ready', time: Date.now()
            }, 5000, function () {
                console.log("客户端准备完成");
            });
        });
        client.on('ping', function heartbeat(data) {
        });
        client.on('close', function close(code) {
            console.warn('连接断开', code);
            start_bytes = 0;
            end_bytes = 0;
            client = null;
            setTimeout(function () {
                CreateWebsocketClient();
                console.log("重连", moment().format("YYYY-MM-DD HH:mm:ss"));
            }, 5000);
        });
        client.on("error", function error(err) {
            console.log("error: %s,code: %s, address: %s:%s", err.errno, err.code, err.address, err.port);
        });
        client.on('message', function message(data, isBinary) {
            if (isBinary) {
                handleBinaryMessage(data);
            } else {
                handleTextMessage(data.toString());
            }
        });
    } catch (e) {
        console.warn('Error: %s', e.error);
    }
}

/**
 * 处理文本消息
 * @param message
 */
async function handleTextMessage(message) {
    if (Tool.isJson(message)) {
        try {
            message = JSON.parse(message);
            // 服务器准备完成
            if ('start' === message.action) {
                // 获取要传输的文件信息列表
                if (fileList.length == 0) {
                    Tool.scanFile(FILE_DIR, fileList);
                }
                // 检查是否无文件信息
                if (fileList.length == 0) {
                    // 没有文件
                    sendToServer({action: 'wait'});
                    return;
                }
                let filePath = fileList[0];
                file_info.name = path.basename(fileList[0]);
                file_info.dir = path.dirname(fileList[0]);
                file_info.md5 = await Tool.cryptoMd5File(filePath);
                let state = fse.statSync(filePath);
                file_info.size = state.size;
                // 发送文件基本信息
                sendToServer({
                    action: 'start',
                    ...file_info
                });
            } else if ('transfer' == message.action) {// 传输
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
                    console.log('向服务端 %s 传输数据: %d--%d bytes', host, message.start, message.start + data.length);
                    client.send(data, {binary: true});
                });
            } else if ('complete' == message.action) {
                let destPath = file_info.dir.replace(FILE_DIR, SYNED_DIR);
                try {
                    // 创建目录
                    fse.ensureDirSync(destPath);
                    fse.moveSync(`${file_info.dir}/${file_info.name}`, `${destPath}/${file_info.name}`);
                    console.log("移动完成，开始下一个同步");
                } catch (err) {
                    console.error(err)
                }
                fileList.splice(0, 1);
                file_info = new Object();
                // 2 秒之后继续下一个文件传输
                sendToServer({action: 'next'}, 2000);
            }
        } catch (e) {
            console.log("Error %s", e.errno);
        }
    } else {
        //To Do
        client.pong()
    }
}

/**
 * 二进制数据
 * @param data
 */
function handleBinaryMessage(data) {
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
                console.log("文件内容全部写入完毕 %s", file_info.name);
                // 检查文件是否完整
                let file_md5 = await Tool.cryptoMd5File(`${file_info.dir}/${file_info.name}`);
                if (file_md5 == file_info.md5) {
                    // 同步下一个文件
                    sendToServer({
                        action: 'delete', name: file_info.name, time: Date.now()
                    }, 1000);
                    file_info = {};
                }
            } else {
                start_bytes += chunkSize;
                end_bytes = (start_bytes + chunkSize) >= file_info.size ? file_info.size : start_bytes + chunkSize;
                // 读取下一个片段
                sendToServer({
                    action: 'transfer', start: start_bytes, end: end_bytes, chunk: chunkSize
                });
            }
        });
    }
}

function sendToServer(query, delayTime = 0, call = null) {
    if (delayTime > 0) {
        setTimeout(() => {
            client.send(JSON.stringify(query));
            call && call();
        }, delayTime);
    } else {
        client.send(JSON.stringify(query));
        call && call();
    }
}

CreateWebsocketClient();

