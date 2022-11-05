# NodeJS WebSocket  文件同步服务

###项目说明###
采用NodeJS + WebSocket 实现文件传输功能

###客户端向服务端同步

+ 服务端入口 【src\server\index.js】
+ 客户端入口 【src\client\index.js】

###服务端向客户端同步

+ 服务端入口 【src\server\index - 副本.js】
+ 客户端入口 【src\client\index - 副本.js】

###特点
+ 自动循环遍历，一次遍历100个文件（可自定义）
+ 支持文件断点传输
+ 支持文件完整性检测
+ 分块传输支持大文件
