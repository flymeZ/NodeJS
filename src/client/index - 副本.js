// 客户端
const WebSocket = require("ws");
const moment = require("moment");
const Tool = require("../tools/tools");
const path = require("path");
const fse = require("fs-extra");

const host = Tool.getLocalIP();
const port = 8092;
let client = null;
let file_info = new Object();
// 每次读取1M
const chunkSize = 1048576;
let start_bytes = 0;
let end_bytes = 0;
// 存储盘根目录
const ROOT_DIR = path.resolve('F:\\');


// 创建客户端
function CreateWebsocketClient() {
    try {
        client = new WebSocket(`ws://${host}:${port}?token=505857cad57769f4afc6703949432780`);
        client.on("open", function open() {
            console.log("客户端已打开,准备同步文件 delay 5s");
            sendToServer({
                action: 'start', time: Date.now()
            }, 5000, function () {
                console.log("开始同步文件");
            });
        });
        client.on('ping', function heartbeat(data) {
        });
        client.on('close', function close(code) {
            console.warn('连接断开', code);
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
 * @param data
 */
function handleTextMessage(data) {
    if (Tool.isJson(data)) {
        try {
            let {action, name, size, md5, dir} = JSON.parse(data);
            if ('ready' == action) {// 开始
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
                        sendToServer({
                            action: 'delete', name: name, time: Date.now()
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
                console.log('=====================>>开始同步下一个文件');
                console.log(file_info);
                // 开始获取文件数据
                sendToServer({
                    action: 'transfer', start: start_bytes, end: end_bytes, chunk: chunkSize
                });
            } else if ('next' == action) {
                sendToServer({
                    action: 'start', time: Date.now()
                });
            } else if ('wait' == action) {
                // 暂无文件 定时重新开始
                console.log('暂无需要同步的文件 %s', moment().format("YYYY-MM-DD HH:mm:ss"));
                sendToServer({
                    action: 'start', time: Date.now()
                }, 15000);
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
                if (start_bytes + chunkSize >= file_info.size) {
                    start_bytes = end_bytes;
                } else {
                    start_bytes += chunkSize;
                }
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

