/**************************************

脚本名称：阿里云盘签到 
脚本作者：@Sliverkiss
更新日期：2024-01-16 14:13:56

2024.01.18 优化代码逻辑与通知样式,增加时光间自动领取任务


------------------------------------------
- 基于@zqzess、@lowking修改，修复领取备份奖励
- 重构代码，优化通知样式，支持多账号
- 感谢@chavyleung提供的Env，以及@zqzess、@lowking两位大佬的脚本作为参考
------------------------------------------
原作者脚本地址：
@zqess: https://raw.githubusercontent.com/zqzess/rule_for_quantumultX/master/js/Mine/aDriveCheckIn/aDriveCheckIn.js
@lowking: https://raw.githubusercontent.com/lowking/Scripts/master/ali/aliYunPanCheckIn.js
------------------------------------------
脚本兼容：Surge、QuantumultX、Loon、Shadowrocket、Node.js
只测试过QuantumultX，其它环境请自行尝试

*************************
【 签到脚本使用教程 】:
*************************

单账号(ck格式兼容@zqess,若已经获取，可直接使用)：
1.boxjs可以查看refresh_token
2.获取token，打开阿里网盘即可获取，如果没有token获取通知，请先关闭阿里网盘，等待几秒重新开启阿里网盘。
3.首次订阅脚本，请停止脚本工具运行再重新启动，使MITM生效
4.本脚本已实现自动刷新token，只有第一次使用需要获取token，随后可关闭token获取，无需再次启用
5.请使用boxjs来选择是否关闭自动领取奖励

多账号（自行摸索）：
1.在单账号的基础上，将获取到的ck数据，填写到ADriveCheckIn，用@分隔
2.格式为：账号1ck数据@账号2ck数据
3.账号ck数据可通过重写自动获取，在boxjs中通过ADriveCheckIn查询
4.如使用多账号，将数据填到boxjs后，请关闭获取ck重写，避免产生不必要的错误

QuantumultX配置如下：

[task_local]
0 7,11 * * * https://gist.githubusercontent.com/Sliverkiss/33800a98dcd029ba09f8b6fc6f0f5162/raw/aliyun.js, tag=阿里云签到, img-url=https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/apps/AliYunDrive.png, enabled=true

[rewrite_local]
^https:\/\/(auth|aliyundrive)\.alipan\.com\/v2\/account\/token url script-request-body https://raw.githubusercontent.com/zqzess/rule_for_quantumultX/master/js/Mine/aDriveCheckIn/aDriveCheckIn.js

[MITM]
hostname = auth.alipan.com,auth.aliyundrive.com
------------------------------------------
1、此脚本仅用于学习研究，不保证其合法性、准确性、有效性，请根据情况自行判断，本人对此不承担任何保证责任。
2、由于此脚本仅用于学习研究，您必须在下载后 24 小时内将所有内容从您的计算机或手机或任何存储设备中完全删除，若违反规定引起任何事件本人对此均不负责。
3、请勿将此脚本用于任何商业或非法目的，若违反规定请自行对此负责。
4、此脚本涉及应用与本人无关，本人对因此引起的任何隐私泄漏或其他后果不承担任何责任。
5、本人对任何脚本引发的问题概不负责，包括但不限于由脚本错误引起的任何损失和损害。
6、如果任何单位或个人认为此脚本可能涉嫌侵犯其权利，应及时通知并提供身份证明，所有权证明，我们将在收到认证文件确认后删除此脚本。
7、所有直接或间接使用、查看此脚本的人均应该仔细阅读此声明。本人保留随时更改或补充此声明的权利。一旦您使用或复制了此脚本，即视为您已接受此免责声明。
******************************************/


// env.js 全局
const $ = new Env("☁️阿里云盘签到");
const ckName = "ADriveCheckIn";
//-------------------- 一般不动变量区域 -------------------------------------
const Notify = 1;//0为关闭通知,1为打开通知,默认为1
const notify = $.isNode() ? require('./sendNotify') : '';
let envSplitor = ["@"]; //多账号分隔符
let userCookie = ($.isNode() ? process.env[ckName] : $.getdata(ckName)) || '';
let userList = [];
let userIdx = 0;
let userCount = 0;
//调试
$.is_debug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) || 'false';
//是否自动领取奖励
$.is_reward = ($.isNode() ? process.env.IS_DEDUG : $.getdata('aliyun_reward')) || 'true';
// 为通知准备的空数组
$.notifyMsg = [];
// 缓存上传文件列表
$.uploadFileList = [];
//bark推送
$.barkKey = ($.isNode() ? process.env["bark_key"] : $.getdata("bark_key")) || '';
//---------------------- 自定义变量区域 -----------------------------------

//脚本入口函数main()
async function main() {
    await getNotice()
    console.log('\n================== 任务 ==================\n');
    for (let user of userList) {
        console.log(`🔷账号${user.index} >> Start work`)
        console.log(`随机延迟${user.getRandomTime()}ms`);
        //刷新token
        await user.getAuthorizationKey();
        if (user.ckStatus) {
            //签到
            let { signInCount } = await user.signCheckin();
            //补签卡任务
            await user.finishCardTask();
            //完成时光间备份任务
            await user.finishDeviceRoomTask();
            //领取好运瓶
            await user.bottleTask();
            //批量删除上传空文件
            if ($.uploadFileList.length > 0) {
                await user.removeFiles();
            }
            //领取签到/备份奖励
            await user.getAllReward(signInCount);
        } else {
            //将ck过期消息存入消息数组
            $.notifyMsg.push(`❌账号${user.index} >> Check ck error!`)
        }
    }
}

class UserInfo {
    constructor(str) {
        this.index = ++userIdx;
        this.ADrivreInfo = JSON.parse(str);
        this.ckStatus = true;
        this.bottleStatus = true;
    }
    getRandomTime() {
        return randomInt(1000, 3000)
    }
    //请求二次封装
    Request(options, method) {
        typeof (method) === 'undefined' ? ('body' in options ? method = 'post' : method = 'get') : method = method;
        return new Promise((resolve, reject) => {
            $.http[method.toLowerCase()](options)
                .then((response) => {
                    let res = response.body;
                    res = $.toObj(res) || res;
                    resolve(res);
                })
                .catch((err) => reject(err));
        });
    };
    //一键领取签到/备份奖励
    async getAllReward(signInCount) {
        //是否开启自动领取奖励
        if ($.is_reward == 'false') {
            //判断是否到达月底
            let isLastDay = getGoneDay() == getLastDay();
            console.log(isLastDay);
            $.log(`❌未开启自动领取任务，奖励将会积攒到月底一键清空`);
            $.log(`当前日期: ${getGoneDay()} => ` + (isLastDay ?
                `已到达 ${getLastDay()} 开始领取奖励！`
                : `未到达 ${getLastDay()} 跳过领取奖励！`))
            //到达月底,一键清空奖励
            if (isLastDay) {
                for (let i = 1; i <= getCountDays(); i++) {
                    //签到奖励
                    await this.getSignReword(signInCount);
                    //备份奖励
                    await this.getTaskReword(signInCount);
                }
            }
        } else {
            $.log(`✅已开启自动领取 => 开始领取签到/备份奖励...\n`);
            //签到奖励
            let signMsg = await this.getSignReword(signInCount);
            $.log(`签到: ${signMsg}`);
            //备份奖励
            let backMsg = await this.getTaskReword(signInCount);
            $.log(`备份: ${backMsg}`);
        }
    }
    //获取accessToken
    async getAuthorizationKey() {
        try {
            const options = {
                url: `https://auth.aliyundrive.com/v2/account/token`,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    refresh_token: this.ADrivreInfo.refresh_token,
                    grant_type: 'refresh_token'
                })
            };
            //post方法
            let { avatar, nick_name, refresh_token, access_token } = await this.Request(options);
            //缓存用户信息(avatar=>头像，nick_name=>用户名)
            $.avatar = avatar;
            $.nick_name = nick_name;
            //获取accessKey鉴权
            let accessKey = 'Bearer ' + access_token;
            debug(accessKey, "鉴权")
            this.authorization = accessKey;
            this.ADrivreInfo.refresh_token_body.refresh_token = refresh_token;
            this.ADrivreInfo.refresh_token = refresh_token;
            //刷新token
            if ($.setjson(this.ADrivreInfo, ckName)) {
                $.log('刷新阿里网盘refresh_token成功 🎉')
            } else {
                DoubleLog('刷新阿里网盘refresh_token失败‼️', '', '')
                this.ckStatus = false;
            }
            //accessKey
            return accessKey;
        } catch (e) {
            throw e;
        }
    }
    //查询签到日历
    async signCheckin() {
        console.log(`⏰ 开始执行签到任务\n`)
        try {
            const options = {
                url: "https://member.aliyundrive.com/v2/activity/sign_in_list",
                headers: {
                    'Content-Type': 'application/json',
                    'authorization': this.authorization,
                },
                body: JSON.stringify({})
            }
            //post方法
            let { message, result } = await this.Request(options);
            //
            if (message) {
                DoubleLog(`❌签到失败!${message}`);
                return;
            }
            let { isSignIn, isReward, signInCount, signInInfos } = result;
            //获取今天签到信息
            let signInRes = signInInfos.find(e => Number(e.day) == Number(signInCount));
            let { subtitle, rewards } = signInRes;
            debug(rewards, "签到信息");
            //打印
            if (rewards.length > 0) {
                $.log(`签到天数:${signInCount}=> ${subtitle}`)
                $.log(`用户名: ${$.nick_name} => 第${signInCount}天`)
                $.log(`自动领取: ${$.is_reward == 'false' ? '未开启 => 月底一键清空' : '已开启 => 每日自动领取'}`)
                //今日奖励详情
                $.signReward = rewards[0].name;
                $.backUpReward = rewards[1].name;
                $.log(`\n查询签到日历 => 第${signInCount}天可领取奖励如下:\n签到奖励: ${$.signReward}\n备份奖励: ${$.backUpReward}\n`)
                $.log(`执行签到任务 => 已完成✅\n`);
            }
            //今日是否已签到
            $.signMsg = (isSignIn ? `🎉${$.nick_name}签到成功!` : `️⚠️今天已经签到过了`) || '';
            //打印通知
            DoubleLog(` 第${signInCount}天签到奖励: ${$.signReward}\n`);
            return { signInCount };
        } catch (e) {
            throw e;
        }
    }
    // 领取签到奖励
    async getSignReword(signInCount) {
        try {
            const options = {
                url: `https://member.aliyundrive.com/v1/activity/sign_in_reward`,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: this.authorization,
                },
                body: JSON.stringify({ signInDay: signInCount }),
            };
            //post方法
            let { result, message } = await this.Request(options);
            //打印领取详情
            $.log(`领取第${signInCount}天签到奖励 => 🎉${result.description || result.name}领取成功!`);
            return result.description ? result.description : result.name;
        } catch (e) {
            throw e;
        }
    }
    //领取备份奖励
    async getTaskReword(signInCount) {
        try {
            const options = {
                url: `https://member.aliyundrive.com/v2/activity/sign_in_task_reward?_rx-s=mobile`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({ "signInDay": signInCount })
            };
            //post方法
            let { result, message } = await this.Request(options);
            //打印领取详情
            $.log((result && !message) ? `领取备份奖励 => 🎉${result.description}领取成功!` : `领取备份奖励 => ❌${message}`);
            return (result && !message) ? result.description : message;
        } catch (e) {
            throw e;
        }
    }
    //备份设备列表
    async getDeviceList() {
        try {
            const options = {
                url: `https://api.alipan.com/adrive/v2/backup/device_applet_list_summary`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                    'x-device-id': this.ADrivreInfo.headers['x-device-id'],
                },
                body: JSON.stringify({})
            };
            //post方法
            let { deviceItems } = await this.Request(options);
            $.log(!deviceItems.length ? `❌ 获取设备列表失败: 你账号下没有设备\n` : `✅ 成功获取到 ${deviceItems.length} 台设备\n`);
            debug(deviceItems, "备份设备列表");
            return deviceItems;
        } catch (e) {
            throw e;
        }
    }

    // 上传文件到相册/完成照片备份任务
    async uploadFileToAlbums() {
        try {
            //获取相册信息
            this.albumId = await this.getAlbumsInfo();
            //创建上传文件
            let { file_id, upload_id, upload_url } = await this.createFile(this.albumId, 'iPhone 13');
            //开始上传文件
            await this.toUploadFile(upload_url);
            //完成上传文件
            await this.completeUpload(this.albumId, file_id, upload_id);
            //删除上传文件
            //await this.removeFile(this.albumId, file_id);
            return file_id;
        } catch (e) {
            throw e;
        }
    }
    //完成快传任务
    async finishQuickShare() {
        try {
            this.albumsId = await this.getAlbumsInfo();
            let file_id = await this.getAlbumsList();
            const options = {
                url: `https://api.aliyundrive.com/adrive/v1/share/create`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({
                    drive_file_list: [{
                        drive_id: this.albumsId,
                        file_id
                    }]
                })
            };
            let res = await this.Request(options);
            debug(res, "完成快传任务");
        } catch (e) {
            throw e;
        }
    }
    //获取相册文件列表
    async getAlbumsList() {
        try {
            this.albumsId = await this.getAlbumsInfo();
            const options = {
                url: `https://api.alipan.com/adrive/v2/backup/device/file_list`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({
                    "deviceType": "iOS",
                    "deviceId": this.ADrivreInfo.headers['x-device-id'],
                    "driveId": this.albumsId,
                    "backupView": "album",
                    "parentFileId": "root",
                    "limit": 1
                })
            };
            let res = await this.Request(options);
            //判断相册列表是否存在文件
            if(res?.items.length>0){
                return res?.items[0]?.file_id;
            }else{
                return await this.uploadFileToAlbums();
            }
        } catch (e) {
            throw e;
        }
    }
    //获取相册信息
    async getAlbumsInfo() {
        try {
            const options = {
                url: `https://api.aliyundrive.com/adrive/v1/user/albums_info`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({})
            };
            //{"code":"200","message":"success","data":{"driveId":"339016561","driveName":"alibum"},"resultCode":"200"}
            let { data } = await this.Request(options);
            return data?.driveId;
        } catch (e) {
            throw e;
        }
    }
    //创建上传文件
    async createFile(albumsId, deviceModel) {
        try {
            const options = {
                url: `https://api.aliyundrive.com/adrive/v1/biz/albums/file/create`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                    'x-device-id': this.ADrivreInfo.headers['x-device-id']
                },
                body: JSON.stringify({
                    drive_id: albumsId,
                    part_info_list: [
                        {
                            part_number: 1
                        }
                    ],
                    parent_file_id: 'root',
                    name: Math.floor(Math.random() * 100000000) + '.jpg',
                    type: 'file',
                    check_name_mode: 'auto_rename',
                    size: Math.floor(Math.random() * 30000),
                    create_scene: 'auto_autobackup',
                    device_name: deviceModel,
                    hidden: false,
                    content_type: 'image/jpeg'
                })
            };
            let { file_id, upload_id, part_info_list } = await this.Request(options);
            let upload_url = part_info_list[0]?.upload_url;
            return { file_id, upload_id, upload_url }
        } catch (e) {
            throw e;
        }
    }
    //开始上传文件
    async toUploadFile(upload_url) {
        try {
            const options = {
                url: upload_url,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({})
            };
            let res = await this.Request(options);
            debug(res);
        } catch (e) {
            throw e;
        }
    }
    //完成上传文件
    async completeUpload(albumsId, file_id, upload_id) {
        try {
            const options = {
                url: `https://api.aliyundrive.com/v2/file/complete`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({
                    drive_id: albumsId,
                    upload_id: upload_id,
                    file_id: file_id
                })
            };
            let res = await this.Request(options);
            debug(res);
            $.uploadFileList.push({ file_id });
        } catch (e) {
            throw e;
        }
    }
    //批量清空上传空文件
    async removeFiles() {
        for (let item of $.uploadFileList) {
            await this.removeFile(item.file_id);
        }
    }
    //删除上传文件
    async removeFile(albumsId, file_id) {
        try {
            const options = {
                url: `https://api.alipan.com/adrive/v4/batch`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({
                    "requests": [
                        {
                            "body": {
                                "drive_id": albumsId,
                                "file_id": file_id
                            },
                            "id": file_id,
                            "method": "POST",
                            "url": "\/file\/delete"
                        }
                    ],
                    "resource": "file"
                })
            };
            let res = await this.Request(options);
            debug(res);
        } catch (e) {
            throw e;
        }
    }
    //完成时光间备份任务
    async finishDeviceRoomTask() {
        try {
            //获取相册信息
            this.albumsId = await this.getAlbumsInfo();
            //获取设备列表
            let deviceList = await this.getDeviceList();
            //debug(deviceList);
            $.log(`⏰ 开始执行时光设备间备份任务\n`);
            for (let e of deviceList) {
                //每个设备上传两次空文件
                for (let i = 0; i < 2; i++) {
                    await this.uploadFileToAlbums(this.albumsId, e.deviceId, e.deviceModel);
                }
                //领取时光间奖励
                await this.getEnergyReword(e);
            }
        } catch (e) {
            throw e;
        }
    }
    //领取时光间奖励
    async getEnergyReword(e) {
        try {
            const options = {
                url: `https://member.aliyundrive.com/v1/deviceRoom/rewardEnergy`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({
                    "deviceId": e.deviceId
                })
            };
            //post方法
            let { result, message } = await this.Request(options);
            $.log(`${e.deviceModel}:` + ((result && !message) ? `领取${result?.size}mb成功!` : `${message}`) + "\n");

        } catch (e) {
            throw e;
        }
    }
    //执行好运瓶任务
    async bottleTask() {
        $.log(`⏰ 开始执行好运瓶任务\n`);
        do {
            await this.bottleFish();
        } while (this.bottleStatus);
    }
    //领取好运瓶
    async bottleFish() {
        try {
            const options = {
                url: `https://api.aliyundrive.com/adrive/v1/bottle/fish`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({})
            };
            //{"bottleId":1726268665825546200,"bottleName":"你的名字","shareId":"EG9LdVtcxdw"}
            //{"code":"TooManyRequests","message":"TooManyRequests","requestId":"0a0070d417055857275284776ea12f","display_message":"今天接瓶子次数已用完，明天再来~"}
            let { bottleName, display_message } = await this.Request(options);
            if (display_message) {
                $.log(`好运瓶：${display_message}\n`);
                this.bottleStatus = false;
            } else {
                $.log(`好运瓶[${bottleName}]领取成功！\n`)
            }
        } catch (e) {
            throw e;
        }
    }
    //完成补签卡任务
    async finishCardTask() {
        try {
            console.log(`⏰ 开始执行补签卡任务\n`)
            //翻牌子
            for (let i = 1; i <= 3; i++) {
                await this.flipCard(i)
            }
            //获取任务详情
            const cardDetail = await this.getCardTaskDetail();
            let { period, tasks } = cardDetail;
            //过滤已完成任务
            tasks = tasks.filter(e => e.status == 'unfinished');
            debug(tasks, '未完成任务列表');
            if (!tasks) {
                $.log(`✅补签卡所有任务已完成`);
            } else {
                for (let task of tasks) {
                    switch (task.taskName) {
                        case '当周使用好运瓶翻3次':
                            console.log(`⏰ 开始执行任务: ${task.taskName}`)
                            if (task.status != 'finished') {
                                await this.bottleTask();
                            }
                            console.log(`✅ 成功完成任务: ${task.taskName}`)
                            break
                        case '当周使用快传发送文件给好友':
                            console.log(`⏰ 开始执行任务: ${task.taskName}`)
                            if (task.status != 'finished') {
                                await this.finishQuickShare()
                            }
                            console.log(`✅ 成功完成任务: ${task.taskName}`)
                            break;
                        case '当周备份照片满20张':
                            console.log(`⏰ 开始执行任务: ${task.taskName}`)
                            if (task.status != 'finished') {
                                for (let i = 0; i < 20; i++) {
                                    await this.uploadFileToAlbums()
                                }
                            }
                            console.log(`✅ 成功完成任务: ${task.taskName}`)
                            break;
                        default:
                            console.log(`❌ 不支持当前任务: ${task.taskName}`)
                            break;
                    }
                }
            }
            //领取补签卡奖励
            await this.receiveCard();
        } catch (e) {
            throw e;
        }
    }
    //翻转补签卡任务牌
    async flipCard(position) {
        try {
            const options = {
                url: `https://member.aliyundrive.com/v2/activity/complement_task?_rx-s=mobile`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({ position })
            };
            let res = await this.Request(options);
            debug(res, "翻转补签卡任务牌");
        } catch (e) {
            throw e;
        }
    }
    //获取补签卡任务详情
    async getCardTaskDetail() {
        try {
            const options = {
                url: `https://member.aliyundrive.com/v2/activity/complement_task_detail?_rx-s=mobile`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({})
            };
            let res = await this.Request(options);
            debug(res, "获取补签卡任务详情");
            return res?.result;
        } catch (e) {
            throw e;
        }
    }
    //领取补签卡
    async receiveCard() {
        try {
            const { period, tasks } = await this.getCardTaskDetail()
            //查询完成任务编号
            let task = tasks.find(e => e.status == 'finished');
            //不存在完成任务，跳过领取
            if (!task) return $.log(`未完成补签卡任务，领取奖励失败`);
            const options = {
                url: `https://member.aliyundrive.com/v2/activity/complement_task_reward?_rx-s=mobile`,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: this.authorization,
                },
                body: JSON.stringify({
                    period,
                    taskId: task?.taskId
                })
            };
            let res = await this.Request(options);
            debug(res, "领取补签卡任务奖励");
            $.log(`✅ 补签卡:` + (res.message || "任务已完成，成功领取1张补签卡") + "\n")
            // return res?.result;
        } catch (e) {
            throw e;
        }
    }

}


//获取Cookie
async function getCookie() {

}


async function getNotice() {
    try {
        const urls = ["https://cdn.jsdelivr.net/gh/Sliverkiss/GoodNight@main/notice.json", "https://cdn.jsdelivr.net/gh/Sliverkiss/GoodNight@main/tip.json"];
        for (const url of urls) {
            const options = {
                url,
                headers: {
                    "User-Agent": ""
                },
            }
            const result = await httpRequest(options);
            if (result) console.log(result.notice);
        }
    } catch (e) {
        console.log(e);
    }
}

//主程序执行入口
!(async () => {
    //没有设置变量,执行Cookie获取
    if (typeof $request != "undefined") {
        await getCookie();
        return;
    }
    //未检测到ck，退出
    if (!(await checkEnv())) { throw new Error(`❌未检测到ck，请添加环境变量`) };
    if (userList.length > 0) {
        await main();
    }
})()
    .catch((e) => $.notifyMsg.push(e.message || e))//捕获登录函数等抛出的异常, 并把原因添加到全局变量(通知)
    .finally(async () => {
        if ($.barkKey) { //如果已填写Bark Key
            await BarkNotify($, $.barkKey, $.name, $.notifyMsg.join('\n')); //推送Bark通知
        };
        await SendMsg($.notifyMsg.join('\n'))//带上总结推送通知
        $.done(); //调用Surge、QX内部特有的函数, 用于退出脚本执行
    });

/** --------------------------------辅助函数区域------------------------------------------- */

// 当天
function getGoneDay(n = 0, yearFlag = true) {
    let myDate = new Date();
    myDate.setDate(myDate.getDate() - n);
    let month = myDate.getMonth() + 1;
    let day = myDate.getDate();
    let result =
        "" +
        (yearFlag ? myDate.getFullYear() : "") +
        "/" +
        month +
        "/" +
        (day < 10 ? "0" + day : day);
    return result;
}

// 月底最后一天
function getLastDay() {
    let nowDate = new Date();
    nowDate.setMonth(nowDate.getMonth() + 1);
    nowDate.setDate(0);
    let lastMonthDay = nowDate.toLocaleDateString();
    return lastMonthDay;
}

// 当月有几天
function getCountDays() {
    var curDate = new Date();
    var curMonth = curDate.getMonth();
    curDate.setMonth(curMonth + 1);
    curDate.setDate(0);
    return curDate.getDate();
}


// 双平台log输出
function DoubleLog(data) {
    if ($.isNode()) {
        if (data) {
            console.log(`${data}`);
            $.notifyMsg.push(`${data}`);
        }
    } else {
        console.log(`${data}`);
        $.notifyMsg.push(`${data}`);
    }
}

// DEBUG
function debug(text, title = 'debug') {
    if ($.is_debug === 'true') {
        if (typeof text == "string") {
            console.log(`\n-----------${title}------------\n`);
            console.log(text);
            console.log(`\n-----------${title}------------\n`);
        } else if (typeof text == "object") {
            console.log(`\n-----------${title}------------\n`);
            console.log($.toStr(text));
            console.log(`\n-----------${title}------------\n`);
        }
    }
}


//检查变量
async function checkEnv() {
    if (userCookie) {
        let e = envSplitor[0];
        for (let o of envSplitor)
            if (userCookie.indexOf(o) > -1) {
                e = o;
                break;
            }
        for (let n of userCookie.split(e)) n && userList.push(new UserInfo(n));
        userCount = userList.length;
    } else {
        console.log("未找到CK");
        return;
    }
    return console.log(`共找到${userCount}个账号`), true;//true == !0
}

/**
 * 随机整数生成
 */
function randomInt(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}
// 发送消息
async function SendMsg(message) {
    if (!message) return;
    if (Notify > 0) {
        if ($.isNode()) {
            await notify.sendNotify($.name, message)
        } else {
            $.msg($.name, $.signMsg, message, { 'media-url': $.avatar })
        }
    } else {
        console.log(message)
    }
}

/** ---------------------------------固定不动区域----------------------------------------- */
// prettier-ignore

//请求函数函数二次封装
function httpRequest(options, method) { typeof (method) === 'undefined' ? ('body' in options ? method = 'post' : method = 'get') : method = method; return new Promise((resolve) => { $[method](options, (err, resp, data) => { try { if (err) { console.log(`${method}请求失败`); $.logErr(err) } else { if (data) { typeof JSON.parse(data) == 'object' ? data = JSON.parse(data) : data = data; resolve(data) } else { console.log(`请求api返回数据为空，请检查自身原因`) } } } catch (e) { $.logErr(e, resp) } finally { resolve() } }) }) }
//Bark APP notify
async function BarkNotify(c, k, t, b) { for (let i = 0; i < 3; i++) { console.log(`🔷Bark notify >> Start push (${i + 1})`); const s = await new Promise((n) => { c.post({ url: 'https://api.day.app/push', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t, body: b, device_key: k, ext_params: { group: t } }) }, (e, r, d) => r && r.status == 200 ? n(1) : n(d || e)) }); if (s === 1) { console.log('✅Push success!'); break } else { console.log(`❌Push failed! >> ${s.message || s}`) } } };
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, a) => { s.call(this, t, (t, s, r) => { t ? a(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const a = this.getdata(t); if (a) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, a) => e(a)) }) } runScript(t, e) { return new Promise(s => { let a = this.getdata("@chavy_boxjs_userCfgs.httpapi"); a = a ? a.replace(/\n/g, "").trim() : a; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [i, o] = a.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": i, Accept: "*/*" }, timeout: r }; this.post(n, (t, e, a) => s(a)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), a = !s && this.fs.existsSync(e); if (!s && !a) return {}; { const a = s ? t : e; try { return JSON.parse(this.fs.readFileSync(a)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), a = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, r) : a ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r) } } lodash_get(t, e, s) { const a = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of a) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, a) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[a + 1]) >> 0 == +e[a + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, a] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, a, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, a, r] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(a), o = a ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), a) } catch (e) { const i = {}; this.lodash_set(i, r, t), s = this.setval(JSON.stringify(i), a) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, a) => { !t && s && (s.body = a, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, a) }); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: a, headers: r, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: a, headers: r, body: i, bodyBytes: o }, i, o) }, t => e(t && t.error || "UndefinedError")); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: a, statusCode: r, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: a, statusCode: r, headers: i, rawBody: o, body: n }, n) }, t => { const { message: a, response: r } = t; e(a, r, r && s.decode(r.rawBody, this.encoding)) }) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, (t, s, a) => { !t && s && (s.body = a, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, a) }); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: a, headers: r, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: a, headers: r, body: i, bodyBytes: o }, i, o) }, t => e(t && t.error || "UndefinedError")); break; case "Node.js": let a = require("iconv-lite"); this.initGotEnv(t); const { url: r, ...i } = t; this.got[s](r, i).then(t => { const { statusCode: s, statusCode: r, headers: i, rawBody: o } = t, n = a.decode(o, this.encoding); e(null, { status: s, statusCode: r, headers: i, rawBody: o, body: n }, n) }, t => { const { message: s, response: r } = t; e(s, r, r && a.decode(r.rawBody, this.encoding)) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let a = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in a) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? a[e] : ("00" + a[e]).substr(("" + a[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let a = t[s]; null != a && "" !== a && ("object" == typeof a && (a = JSON.stringify(a)), e += `${s}=${a}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", a = "", r) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } case "Loon": { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } case "Quantumult X": { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl, a = t["update-pasteboard"] || t.updatePasteboard; return { "open-url": e, "media-url": s, "update-pasteboard": a } } case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, a, i(r)); break; case "Quantumult X": $notify(e, s, a, i(r)); break; case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), a && t.push(a), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }