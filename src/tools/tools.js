const SparkMD5 = require("spark-md5")
const fse = require("fs-extra")
const crypto = require("crypto")
const os = require("os")
const path = require("path")

/**
 * 判断是否是JSON字符串
 * @param str
 * @returns {boolean}
 */
const isJson = function isJsonStringAction(str) {
    if (typeof str == 'string') {
        try {
            if (typeof JSON.parse(str) == "object") {
                return true;
            }
        } catch (e) {
            return false;
        }
    }
    return typeof (str) == "object" && Object.prototype.toString.call(str).toLowerCase() === "[object object]" && !str.length;
}

/**
 *  * 扫描指定目录文件
 * @param dir 目录
 * @param filesList 文件列表
 * @param extMap 指定后缀
 * @returns {*[]}
 */
const scanFile = function scanFileAction(dir, filesList = [], extMap = []) {
    try {
        let files = fse.readdirSync(dir);
        let _ext = '';
        for (let i = 0; i < files.length; i++) {
            let fullpath = path.join(dir, files[i]);
            const stat = fse.statSync(fullpath);
            if (stat.isDirectory()) {
                scanFile(fullpath, filesList, extMap);
            } else {
                if (extMap.length > 0) {
                    //获取当前文件后缀
                    _ext = path.extname(files[i]);
                    if (extMap.indexOf(_ext) == -1) {
                        continue;
                    }
                }
                if (filesList.length > 100) {
                    break
                }
                //文件列表
                filesList.push(fullpath);
            }
        }
        return filesList;
    } catch (err) {
        console.error(err);
        return [];
    }
}

/**
 * 获取文件MD5值
 * @param file_path
 * @returns {Promise<unknown>}
 */
const sparkMd5File = function (file_path) {
    return new Promise((resolve, reject) => {
        const reader = fse.createReadStream(file_path, {
            highWaterMark: 1048576
        });
        let spark = new SparkMD5.ArrayBuffer();
        reader.on('error', (err) => {
            reject(err);
        })
        reader.on('data', (chunk) => {
            if (chunk)
                spark.append(chunk);
        });
        reader.on('end', () => {
            resolve(spark.end());
        });
    });
}

/**
 * 获取文件MD5值
 * @param file_path
 * @returns {Promise<unknown>}
 */
const cryptoMd5File = function (file_path) {
    return new Promise((resolve, reject) => {
        const reader = fse.createReadStream(file_path, {
            highWaterMark: 1048576
        });
        let hash = crypto.createHash('md5');
        reader.on('error', (err) => {
            reject(err);
        })
        reader.on('data', (chunk) => {
            if (chunk)
                hash.update(chunk);
        });
        reader.on('end', () => {
            resolve(hash.digest('hex'));
        });
    });
}

/**
 * 获取本机IP地址
 * @returns {string}
 */
const getLocalIP = () => {
    const osType = os.type(); //系统类型
    const network = os.networkInterfaces();//网络接口的对象
    let ip = '0.0.0.0';
    if ('Windows_NT' == osType) {
        for (let dev in network) {
            //win7的网络信息中显示为本地连接，win10显示为以太网
            if (dev == '本地连接' || dev == '以太网') {
                for (let j = 0; j < network[dev].length; j++) {
                    let {address, family, internal} = network[dev][j];
                    if (family === 'IPv4' && address !== '127.0.0.1' && !internal) {
                        ip = address;
                        break;
                    }
                }
            }
        }
    } else if ('Linux' == osType) {
        ip = network.eth0[0].address;
    } else if ('Darwin' == osType) {

    }
    return ip;
}


module.exports = {
    isJson,
    scanFile,
    sparkMd5File,
    cryptoMd5File,
    getLocalIP
}