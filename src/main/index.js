const electron = require('electron')

const { app, BrowserWindow, Tray, ipcMain, dialog } = electron
const path = require('path')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const { setOnCurrentSpace } = require('../wallpaper/outwallpaper.js')
const { openAutoStart, openDisStart } = require('../file/open-start.js')
const { downloadPic, cancelDownloadPic } = require('../file/file.js')
const { getUrls, cancelUrls } = require('../get-image/search.js')
const { hideChildrenWindow, showChildrenWinndow } = require('./info-win.js')
const { newEmail } = require('./mail.js')

const { isDev, isMac, isWin, baseUrl } = require('../utils/utils')

log.transports.file.level = 'info'

// 托盘对象
let mainWindow = null
let appTray = null
let openAppFlag = true

const mainCallBack = {
    'autoUpdater.downloadUpdate': () => {
        autoUpdater.downloadUpdate()
    },
}

appOpenInit()
ipcMainInit()
autoUpdaterInit()


/**
 * 创建程序锁，保证只能打开单个实例 
 * @function appOpenInit
 */
function appOpenInit(){
    if (isWin()) {
        const gotTheLock = app.requestSingleInstanceLock()
        if (!gotTheLock) {
            app.quit()
        } else {
            app.on('second-instance', (event, commandLine, workingDirectory) => {
                if (mainWindow) {
                    if (!mainWindow.isVisible()) {
                        mainWindowShow()
                    }
                    mainWindow.focus()
                }
            })
        }
    } else if (isMac()) {
        app.dock.hide()  
    }
    app.on('ready', () => {
        setTimeout(() => {
            if (!isDev()) {
                autoUpdater.logger = log
                autoUpdater.autoDownload = false
                checkUpdater()
            }
            appInit()
        }, 10)
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })


    app.on('activate', () => {
        if (mainWindow === null) {
            appInit()
        } else {
            mainWindowShow()
        }
    })
}

/**
 * 创建窗口
 * @function createWindow
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        height: 600,
        width: 300,
        frame: false,
        transparent: true,
        show: false,
        alwaysOnTop: true,
        resizable: false, // 禁止变化尺寸
        hasShadow: true, // 是否阴影
        focusable: true,
        fullscreenable: false,
        skipTaskbar: true,
        titleBarStyle: 'customButtonsOnHover'
    })

    // mainWindow.openDevTools()

    mainWindow.loadURL(baseUrl)

    mainWindow.on('blur', () => {
        mainWindow.hide()
    })

    mainWindow.on('closed', () => {
        app.quit()
        mainWindow = null
    })
}

/**
 * 创建 Tray
 * @function createAppTray
 */
function createAppTray() {
    if (isMac()) {
        // eslint-disable-next-line no-undef
        appTray = new Tray(path.resolve(__static, './img/trayTemplate.png'))
    } else if (isWin()) {
        // eslint-disable-next-line no-undef
        appTray = new Tray(path.resolve(__static, './img/tray.png'))
    }

    // 系统托盘图标目录
    appTray.on('click', (event, bounds, position) => {
        // mainWindow === null ? createWindow() : mainWindow.close()
        // return
        // 点击时显示窗口，并修改窗口的显示位置
        function setMainWinPosition(win, trayBounds) {
            try {
                const { screen } = electron
                const winWidth = mainWindow.getSize()[0]
                const winHeight = mainWindow.getSize()[1]
                const cursorPosition = screen.getCursorScreenPoint()
                const currentScreen = screen.getDisplayNearestPoint(cursorPosition)
                const screens = screen.getAllDisplays()

                let screenWidth = 0

                // 这目前判断多屏都是横着拼的多屏,
                for (let i = 0; i < screens.length; i++) {
                    screenWidth += screens[i].workAreaSize.width
                }

                cursorPosition.x = trayBounds.x + trayBounds.width / 2

                const parallelType = cursorPosition.x < screenWidth / 2 ? 'left' : 'right'
                const verticaType = cursorPosition.y < currentScreen.workAreaSize.height / 2 ? 'top' : 'bottom'

                let trayPositionType = '' // 任务栏的位置
                let trayPositionSize = 0
    
                if (currentScreen.workAreaSize.height < currentScreen.size.height) {
                    trayPositionType = verticaType === 'top' ? 'top' : 'bottom'
                    trayPositionSize = currentScreen.size.height - currentScreen.workAreaSize.height
                } else if (currentScreen.workAreaSize.width < currentScreen.size.width) {
                    trayPositionType = parallelType === 'left' ? 'left' : 'right'
                    trayPositionSize = currentScreen.size.width - currentScreen.workAreaSize.width
                }

                let winPositionX = 1
                let winPositionY = 1

                if (trayPositionType === 'top') {
                    winPositionX = Math.max(Math.min(screenWidth - winWidth, cursorPosition.x - (winWidth / 2)), 1)
                    winPositionY = trayBounds.height + 2
                } else if (trayPositionType === 'bottom') {
                    winPositionX = Math.max(Math.min(screenWidth - winWidth, cursorPosition.x - (winWidth / 2)), 1)
                    winPositionY = currentScreen.size.height - trayPositionSize - winHeight
                } else if (trayPositionType === 'left') {
                    winPositionX = trayPositionSize
                    winPositionY = Math.max(Math.min(currentScreen.size.height - winHeight, cursorPosition.y - (winHeight / 2)), 1)
                } else if (trayPositionType === 'right') {
                    winPositionX = screenWidth - trayPositionSize - winWidth
                    winPositionY = Math.max(Math.min(currentScreen.size.height - winHeight, cursorPosition.y - (winHeight / 2)), 1)
                }
                win.setPosition(parseInt(winPositionX, 10), winPositionY)
            } catch (error) {
                log.error(error)
            }
        }
        try {
            if (mainWindow.isVisible()) {
                mainWindow.webContents.send('datainfo', {
                    type: 'windowShow',
                    data: false
                })
                mainWindowHide()
            } else {
                mainWindow.webContents.send('datainfo', {
                    type: 'windowShow',
                    data: true
                })
                mainWindowShow()
                setMainWinPosition(mainWindow, bounds)
            }
        } catch (error) {
            log.error(error)
        }
    })

    mainWindow.on('show', () => {
        appTray.setHighlightMode('never')
    })
    mainWindow.on('hide', () => {
        appTray.setHighlightMode('selection')
    })
}


function appInit() {
    if (mainWindow == null) {
        createWindow() // 创建主窗口
    } else {
        mainWindowShow()
    }
    if (appTray == null) {
        createAppTray() // 创建系统托盘    
    }
}

function mainWindowShow() {
    let opacity = 0
    mainWindow.show()
    const time = setInterval(() => {
        if (opacity >= 1) {
            opacity = 1
            clearInterval(time)
        }
        mainWindow.setOpacity(opacity)
        opacity = parseFloat((opacity + 0.1).toFixed(1))
    }, 30)
}

function mainWindowHide() {
    let opacity = 1
    const time = setInterval(() => {
        if (opacity <= 0) {
            opacity = 0.0
            clearInterval(time)
            mainWindow.hide()
        }
        mainWindow.setOpacity(opacity)
        opacity = parseFloat((opacity - 0.1).toFixed(1))
    }, 30)
}


function ipcMainInit() {
    /** * 主进程传一个字符串给渲染进程，渲染进程在传递事件给主进程 用于主进程中的一些函数回调 */
    ipcMain.on('maincallback', (event, data, argument) => {
        if (typeof mainCallBack[data] !== 'undefined') {
            mainCallBack[data](argument)
        }
    })

    // 取消所有请求
    // eslint-disable-next-line no-unused-vars
    ipcMain.on('cancelAllRequest', (event, data) => {
        cancelDownloadPic()
        cancelUrls()
    })


    ipcMain.on('dataWallpaper', (event, arg) => {
        downloadPic(arg.downloadUrl, mainWindow).then((result) => {
            setOnCurrentSpace(result)
            event.sender.send('dataWallpaper', 'success')
            log.info('设置壁纸成功')
        }).catch((error) => {
            log.error('设置壁纸失败')
            event.sender.send('dataWallpaper', 'error')
            log.error(error)
        })
    })

    ipcMain.on('getImageUrls', (event, data) => {
        getUrls(data).then((result) => {
            mainWindow.webContents.send('datainfo', {
                type: 'urls',
                data: result
            })
        })
    })

    ipcMain.on('btn', (event, data) => {
        if (data.type === 'quit') {
            app.quit()
        // eslint-disable-next-line no-empty
        } else if (data.type === 'searchKey') {

        } else if (data.type === 'openStart') {
            if (data.data) {
                openAutoStart()
            } else {
                openDisStart()
            }
        } else if (data.type === 'openChildren') {
            if (data.data) {
                showChildrenWinndow()
            } else {
                hideChildrenWindow()
            }
        } else if (data.type === 'newEmail') {
            newEmail(data.data.html, data.data.telUser, {
                version: autoUpdater.currentVersion,
                emailType: data.data.emailType
            }).then(() => {
                event.sender.send('sendnewEmail', 'success', data.data.emailType)
            }).catch((error) => {
                event.sender.send('sendnewEmail', 'error', data.data.emailType, error)
            })
        } else if (data.type === 'check_newVersion') {
            checkUpdater()
        }
    })
}

function checkUpdater() {
    autoUpdater.checkForUpdates().then((result) => {
    }).catch((error) => {
        log.error(error)
    })
}

function autoUpdaterInit() {
    /** * 下载完成 */
    autoUpdater.on('update-downloaded', () => {
        autoUpdater.quitAndInstall()
    })

    autoUpdater.on('error', (info) => {
        if (openAppFlag) {
            openAppFlag = false
            return
        }
        dialog.showMessageBox({
            type: 'error',
            buttons: ['关闭'],
            title: '版本更新',
            message: '版本更新检测出错',
            detail: '可能是网路不好或者版本Bug,请提交意见反馈',
            // eslint-disable-next-line no-undef
            icon: path.resolve(__static, './img/banben.png')
        })
    })


    autoUpdater.on('update-available', (info) => {
        dialog.showMessageBox({
            type: 'info',
            buttons: ['是', '否'],
            title: '版本更新',
            message: `当前版本:${autoUpdater.currentVersion}`,
            detail: `检测到新版本:${info.version},是否升级？`,
            // eslint-disable-next-line no-undef
            icon: path.resolve(__static, './img/banben.png')
        }, (response) => {
            if (response === 0) {
                autoUpdater.downloadUpdate()
            } else if (response === 1) {
                console.log('1')
            }
        })
        log.info('检测到新版本', info)
    })

    autoUpdater.on('checking-for-update', (info) => {
        log.info('检测更新已发出', info)
    })


    autoUpdater.on('update-not-available', (info) => {
        if (openAppFlag) {
            openAppFlag = false
            return
        }
        log.error('没有检测到新版本', info)
        dialog.showMessageBox({
            type: 'info',
            buttons: ['关闭'],
            title: '版本更新',
            message: `当前版本:${autoUpdater.currentVersion}`,
            detail: '当前已是最新版本，无需更新',
            // eslint-disable-next-line no-undef
            icon: path.resolve(__static, './img/banben.png')
        })
    })


    // 更新下载进度
    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow.webContents.send('datainfo', {
            type: 'updaterProgress',
            data: progressObj.percent
        })
    })
}
