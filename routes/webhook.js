'use strict'

// modules
const express = require('express');
const router = express.Router();
const request = require('request-promise')
const cheerio = require('cheerio')
const line = require('@line/bot-sdk');
const dotenv = require('dotenv');

// configs
dotenv.config(); // 開発用の環境変数を.envから取得する
const config = require('../config');

// cheerio
const options = {
    transform: (body) => {
        return cheerio.load(body);
    }
};

// create LINE SDK config from env variables
const lineConfig = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.Client(lineConfig);

// create Express app
const app = express();

/* GET users listing. */
router.get('/', function(req, res, next) {
    console.log('**** GET ACCESS ****');
    res.send('respond with a resource');
});

/* POST webhook listing. */
router.post('/', function(req, res, next) {
    console.log('**** POST ACCESS ****');

    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

// event handler
async function handleEvent(event) {
    var result;
    // LINEの接続確認の処理を行う
    if (event.replyToken === config.line.replyToken) {
        console.log('LINE Webhook URL 接続確認');
        return;
    }

    // 受信したメッセージがテキストかどうか判定する
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }

    if (event.message.text === '使い方') {
        result = config.helpmessage;
    }

    // 武器種検索処理(リストより取得)
    result = result ? result : await searchWeapon(event.message.text);
    // モンスター検索処理(Webスクレイピング)
    result = result ? result : await searchMonster(event.message.text);
    // 装飾品検索処理(Webスクレイピング)
    result = result ? result : await searchSoshokuhin(event.message.text);

    if (!result) {
        console.log('検索結果：なし');
        return Promise.resolve(null);
    }
    console.log('検索結果：' + '\n' + result);
    const message = {
        type: 'text',
        text: result
    }
    // use reply API
    return client.replyMessage(event.replyToken, message)
}

// 武器種検索処理
async function searchWeapon(target) {
    let text = '';
    let weapon;
    console.log('searchWeapon start.');

    if (config.weapons.hasOwnProperty(target)) {
        weapon = JSON.parse(JSON.stringify(config.weapons[target]));
        text = target + '\n';
    }
    if (weapon) {
        for (var key in weapon) {
            text += key + '\n' + weapon[key] + '\n';
        }
    }
    return text.trim();
}

// モンスター検索処理
async function searchMonster(target) {
    const url = config.urls.monster;
    let map = new Map();
    console.log('searchMonster start.');

    return request.get(url, options)
        .then($ => {
            $('.mhw_monsterlist', '#article-body').each((i, element) => {
                $('tr', element).each((j, child) => {
                    if ($(child).attr('data-col1')) {
                        var name = $(child).data('col1');
                        if (name.match(target)) {
                            var url = $(child).find('a').attr('href');
                            map.set(name, url);
                        }
                    }
                });
            });
            return mapToText(map);
        })
        .catch(e => {
            console.error(e)
            return null
        });
}

// 装飾品検索処理
async function searchSoshokuhin(target) {
    const url = config.urls.soshokuhin;
    var regex = /^[0-9]$/;
    let map = new Map();
    console.log('searchSoshokuhin start.')
    // 数値のみの場合処理を終了する
    if (regex.test(target)) {
        return null;
    }
    return request.get(url, options)
        .then($ => {
            $('.all-center', '#main-contents').each((i, element) => {
                $('tr', element).each((j, child) => {
                    var name = $(child).find('td:first-child').find('a').text();
                    if (name.match(target)) {
                        map.set(name, '');
                    }
                });
            });
            if (map.size) {
                map.set(url, '');
            }
            return mapToText(map);
        })
        .catch(e => {
            console.error(e)
            return null
        });
}

async function replyHelpMessage() {

}

// Mapオブジェクトをテキストに変換する
function mapToText(map) {
    let text = '';
    for(var key of map.keys()) {
        let value = map.get(key);
        text += key + '\n' + (value ? value + '\n' : '');
    }
    return text.trim();
}

module.exports = router;
