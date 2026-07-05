require("dotenv").config();
const {
  CloudClient,
  FileTokenStore,
  logger: sdkLogger,
} = require("cloud189-sdk");
const recording = require("log4js/lib/appenders/recording");
const accounts = require("../accounts");
const { mask, delay } = require("./utils");
const push = require("./push");
const { log4js, cleanLogs, catLogs } = require("./logger");
const tokenDir = ".token";

sdkLogger.configure({
  isDebugEnabled: process.env.CLOUD189_VERBOSE === "1",
});

// 涓汉浠诲姟绛惧埌
const doUserTask = async (cloudClient, logger) => {
  const result = await cloudClient.userSign()
  const netdiskBonus = result.isSign? 0: result.netdiskBonus
  logger.info(`涓汉绛惧埌浠诲姟: 鑾峰緱 ${netdiskBonus}M 绌洪棿`);
};

const run = async (userName, password, userSizeInfoMap, logger) => {
  if (userName && password) {
    const before = Date.now();
    try {
      logger.log("寮€濮嬫墽琛�");
      const cloudClient = new CloudClient({
        username: userName,
        password,
        token: new FileTokenStore(`${tokenDir}/${userName}.json`),
      });
      const beforeUserSizeInfo = await cloudClient.getUserSizeInfo();
      userSizeInfoMap.set(userName, {
        cloudClient,
        userSizeInfo: beforeUserSizeInfo,
        logger,
      });
      await Promise.all([doUserTask(cloudClient, logger)]);
    } catch (e) {
      if (e.response) {
        logger.log(`璇锋眰澶辫触: ${e.response.statusCode}, ${e.response.body}`);
      } else {
        logger.error(e);
      }
      if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT") {
        logger.error("璇锋眰瓒呮椂");
        throw e;
      }
    } finally {
      logger.log(
        `鎵ц瀹屾瘯, 鑰楁椂 ${((Date.now() - before) / 1000).toFixed(2)} 绉抈
      );
    }
  }
};

// 寮€濮嬫墽琛岀▼搴�
async function main() {
  //  鐢ㄤ簬缁熻瀹為檯瀹归噺鍙樺寲
  const userSizeInfoMap = new Map();
  for (let index = 0; index < accounts.length; index++) {
    const account = accounts[index];
    const { userName, password } = account;
    const userNameInfo = mask(userName, 0, userName.length);
    const logger = log4js.getLogger(userName);
    logger.addContext("user", userNameInfo);
    await run(userName, password, userSizeInfoMap, logger);
  }

  //鏁版嵁姹囨€�
  for (const [
    userName,
    { cloudClient, userSizeInfo, logger },
  ] of userSizeInfoMap) {
    const afterUserSizeInfo = await cloudClient.getUserSizeInfo();
    logger.log(
      `涓汉瀹归噺锛氣瑔锔�  ${(
        (afterUserSizeInfo.cloudCapacityInfo.totalSize -
          userSizeInfo.cloudCapacityInfo.totalSize) /
        1024 /
        1024
      ).toFixed(2)}M/${(
        afterUserSizeInfo.cloudCapacityInfo.totalSize /
        1024 /
        1024 /
        1024
      ).toFixed(2)}G`,
      `瀹跺涵瀹归噺锛氣瑔锔�  ${(
        (afterUserSizeInfo.familyCapacityInfo.totalSize -
          userSizeInfo.familyCapacityInfo.totalSize) /
        1024 /
        1024
      ).toFixed(2)}M/${(
        afterUserSizeInfo.familyCapacityInfo.totalSize /
        1024 /
        1024 /
        1024
      ).toFixed(2)}G`
    );
  }
}

(async () => {
  try {
    await main();
    //绛夊緟鏃ュ織鏂囦欢鍐欏叆
    await delay(1000);
  } finally {
    const logs = catLogs();
    const events = recording.replay();
    const content = events.map((e) => `${e.data.join("")}`).join("  \n");
    push("澶╃考浜戠洏鑷姩绛惧埌浠诲姟", logs + content);
    recording.erase();
    cleanLogs();
  }
})();
