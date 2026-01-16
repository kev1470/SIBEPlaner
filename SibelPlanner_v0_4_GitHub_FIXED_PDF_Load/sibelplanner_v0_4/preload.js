const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('env', { platform: process.platform });
