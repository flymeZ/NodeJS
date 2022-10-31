const fse = require("fs-extra")
const path = require("path");


const ROOT_DIR = path.resolve('D:\\FilesPdf');

// 递归扫描文件列表
function scanFileList(dir, filesList = [], extMap = []) {
    try {
        let files = fse.readdirSync(dir);
        for (let i = 0; i < files.length; i++) {
            let fullpath = path.join(dir, files[i]);
            const stat = fse.statSync(fullpath);
            if (stat.isDirectory()) {
                scanFileList(path.join(dir, files[i]), filesList, extMap); //递归读取文件
            } else {
                // 判断是否需要过滤指定类型文件
                if (extMap.length > 0) {
                    let _ext = path.extname(files[i]);
                    if (extMap.indexOf(_ext) == -1) {
                        continue;
                    }
                }
                filesList.push(fullpath);
            }
        }
        return filesList;
    } catch (err) {
        console.error(err);
        return [];
    }
}

// 文件列表
let filesList = [];
console.time('test');
scanFileList(ROOT_DIR, filesList, '.doc');
console.timeEnd('test');
console.log(filesList);
console.log(path.dirname(filesList[1]));
console.log(path.basename(filesList[1]));
filesList.splice(0,1);
console.log(filesList);
console.log(path.parse('C:\\path\\dir\\file.txt'));
console.log(path.parse('D:\\FilesPdf\\GAO\\2022-07-12'));

// 创建目录结构
//fse.ensureDirSync('D:\\FilesPdf\\测试\\2022-09-30\\222');

