/*****************************************************************************\
|                                               ( )_  _                       |
|    _ _    _ __   _ _    __    ___ ___     _ _ | ,_)(_)  ___   ___     _     |
|   ( '_`\ ( '__)/'_` ) /'_ `\/' _ ` _ `\ /'_` )| |  | |/',__)/' v `\ /'_`\   |
|   | (_) )| |  ( (_| |( (_) || ( ) ( ) |( (_| || |_ | |\__, \| (˅) |( (_) )  |
|   | ,__/'(_)  `\__,_)`\__  |(_) (_) (_)`\__,_)`\__)(_)(____/(_) (_)`\___/'  |
|   | |                ( )_) |                                                |
|   (_)                 \___/'                                                |
|                                                                             |
| General Bots Copyright (c) Pragmatismo.io. All rights reserved.             |
| Licensed under the AGPL-3.0.                                                |
|                                                                             |
| According to our dual licensing model, this program can be used either      |
| under the terms of the GNU Affero General Public License, version 3,        |
| or under a proprietary license.                                             |
|                                                                             |
| The texts of the GNU Affero General Public License with an additional       |
| permission and of our proprietary license can be found at and               |
| in the LICENSE file you have received along with this program.              |
|                                                                             |
| This program is distributed in the hope that it will be useful,             |
| but WITHOUT ANY WARRANTY, without even the implied warranty of              |
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the                |
| GNU Affero General Public License for more details.                         |
|                                                                             |
| "General Bots" is a registered trademark of Pragmatismo.io.                 |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights, title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/

/**
 * @fileoverview Conversation handling and external service calls.
 */

'use strict';

import { MessageFactory, RecognizerResult, TurnContext } from 'botbuilder';
import { LuisRecognizer } from 'botbuilder-ai';
import { GBDialogStep, GBLog, GBMinInstance, IGBCoreService } from 'botlib';
import { GBServer } from '../../../src/app';
import { Readable } from 'stream';
import { GBAdminService } from '../../admin.gbapp/services/GBAdminService';
import { SecService } from '../../security.gbapp/services/SecService';
import { AnalyticsService } from '../../analytics.gblib/services/AnalyticsService';
import { MicrosoftAppCredentials } from 'botframework-connector';
import { GBConfigService } from './GBConfigService';
import { CollectionUtil, AzureText } from 'pragmatismo-io-framework';
import { GuaribasUser } from '../../security.gbapp/models';
const urlJoin = require('url-join');
const PasswordGenerator = require('strict-password-generator').default;
const Nexmo = require('nexmo');
const { join } = require('path');
const shell = require('any-shell-escape');
const { exec } = require('child_process');
const prism = require('prism-media');
const uuidv4 = require('uuid/v4');
const request = require('request-promise-native');
const fs = require('fs');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const { IamAuthenticator } = require('ibm-watson/auth');

/**
 * Provides basic services for handling messages and dispatching to back-end
 * services like NLP or Search.
 */
export class GBConversationalService {

  /**
   * Reference to the core service.
   */
  public coreService: IGBCoreService;

  /**
   * 
   * @param coreService 
   */
  constructor(coreService: IGBCoreService) {
    this.coreService = coreService;
  }

  static defaultDiacriticsRemovalMap = [
    { 'base': 'A', 'letters': '\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F' },
    { 'base': 'AA', 'letters': '\uA732' },
    { 'base': 'AE', 'letters': '\u00C6\u01FC\u01E2' },
    { 'base': 'AO', 'letters': '\uA734' },
    { 'base': 'AU', 'letters': '\uA736' },
    { 'base': 'AV', 'letters': '\uA738\uA73A' },
    { 'base': 'AY', 'letters': '\uA73C' },
    { 'base': 'B', 'letters': '\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181' },
    { 'base': 'C', 'letters': '\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E' },
    { 'base': 'D', 'letters': '\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779\u00D0' },
    { 'base': 'DZ', 'letters': '\u01F1\u01C4' },
    { 'base': 'Dz', 'letters': '\u01F2\u01C5' },
    { 'base': 'E', 'letters': '\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E' },
    { 'base': 'F', 'letters': '\u0046\u24BB\uFF26\u1E1E\u0191\uA77B' },
    { 'base': 'G', 'letters': '\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E' },
    { 'base': 'H', 'letters': '\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D' },
    { 'base': 'I', 'letters': '\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197' },
    { 'base': 'J', 'letters': '\u004A\u24BF\uFF2A\u0134\u0248' },
    { 'base': 'K', 'letters': '\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2' },
    { 'base': 'L', 'letters': '\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780' },
    { 'base': 'LJ', 'letters': '\u01C7' },
    { 'base': 'Lj', 'letters': '\u01C8' },
    { 'base': 'M', 'letters': '\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C' },
    { 'base': 'N', 'letters': '\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4' },
    { 'base': 'NJ', 'letters': '\u01CA' },
    { 'base': 'Nj', 'letters': '\u01CB' },
    { 'base': 'O', 'letters': '\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u00D6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C' },
    { 'base': 'OI', 'letters': '\u01A2' },
    { 'base': 'OO', 'letters': '\uA74E' },
    { 'base': 'OU', 'letters': '\u0222' },
    { 'base': 'OE', 'letters': '\u008C\u0152' },
    { 'base': 'oe', 'letters': '\u009C\u0153' },
    { 'base': 'P', 'letters': '\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754' },
    { 'base': 'Q', 'letters': '\u0051\u24C6\uFF31\uA756\uA758\u024A' },
    { 'base': 'R', 'letters': '\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782' },
    { 'base': 'S', 'letters': '\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784' },
    { 'base': 'T', 'letters': '\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786' },
    { 'base': 'TZ', 'letters': '\uA728' },
    { 'base': 'U', 'letters': '\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u00DC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244' },
    { 'base': 'V', 'letters': '\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245' },
    { 'base': 'VY', 'letters': '\uA760' },
    { 'base': 'W', 'letters': '\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72' },
    { 'base': 'X', 'letters': '\u0058\u24CD\uFF38\u1E8A\u1E8C' },
    { 'base': 'Y', 'letters': '\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE' },
    { 'base': 'Z', 'letters': '\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762' },
    { 'base': 'a', 'letters': '\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250' },
    { 'base': 'aa', 'letters': '\uA733' },
    { 'base': 'ae', 'letters': '\u00E6\u01FD\u01E3' },
    { 'base': 'ao', 'letters': '\uA735' },
    { 'base': 'au', 'letters': '\uA737' },
    { 'base': 'av', 'letters': '\uA739\uA73B' },
    { 'base': 'ay', 'letters': '\uA73D' },
    { 'base': 'b', 'letters': '\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253' },
    { 'base': 'c', 'letters': '\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184' },
    { 'base': 'd', 'letters': '\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A' },
    { 'base': 'dz', 'letters': '\u01F3\u01C6' },
    { 'base': 'e', 'letters': '\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD' },
    { 'base': 'f', 'letters': '\u0066\u24D5\uFF46\u1E1F\u0192\uA77C' },
    { 'base': 'g', 'letters': '\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F' },
    { 'base': 'h', 'letters': '\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265' },
    { 'base': 'hv', 'letters': '\u0195' },
    { 'base': 'i', 'letters': '\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131' },
    { 'base': 'j', 'letters': '\u006A\u24D9\uFF4A\u0135\u01F0\u0249' },
    { 'base': 'k', 'letters': '\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3' },
    { 'base': 'l', 'letters': '\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747' },
    { 'base': 'lj', 'letters': '\u01C9' },
    { 'base': 'm', 'letters': '\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F' },
    { 'base': 'n', 'letters': '\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5' },
    { 'base': 'nj', 'letters': '\u01CC' },
    { 'base': 'o', 'letters': '\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u00F6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275' },
    { 'base': 'oi', 'letters': '\u01A3' },
    { 'base': 'ou', 'letters': '\u0223' },
    { 'base': 'oo', 'letters': '\uA74F' },
    { 'base': 'p', 'letters': '\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755' },
    { 'base': 'q', 'letters': '\u0071\u24E0\uFF51\u024B\uA757\uA759' },
    { 'base': 'r', 'letters': '\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783' },
    { 'base': 's', 'letters': '\u0073\u24E2\uFF53\u00DF\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B' },
    { 'base': 't', 'letters': '\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787' },
    { 'base': 'tz', 'letters': '\uA729' },
    { 'base': 'u', 'letters': '\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u00FC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289' },
    { 'base': 'v', 'letters': '\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C' },
    { 'base': 'vy', 'letters': '\uA761' },
    { 'base': 'w', 'letters': '\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73' },
    { 'base': 'x', 'letters': '\u0078\u24E7\uFF58\u1E8B\u1E8D' },
    { 'base': 'y', 'letters': '\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF' },
    { 'base': 'z', 'letters': '\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763' }
  ];


  // "what?" version ... http://jsperf.com/diacritics/12
  public static removeDiacriticsAndPunctuation(str) {

    str = GBConversationalService.removeDiacritics(str);
    return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

  }
  public static removeDiacritics(str) {

    var diacriticsMap = {};
    for (var i = 0; i < GBConversationalService.defaultDiacriticsRemovalMap.length; i++) {
      var letters = GBConversationalService.defaultDiacriticsRemovalMap[i].letters;
      for (var j = 0; j < letters.length; j++) {
        diacriticsMap[letters[j]] = GBConversationalService.defaultDiacriticsRemovalMap[i].base;
      }
    }
    str = str.replace(/[^\u0000-\u007E]/g, function (a) {
      return diacriticsMap[a] || a;
    });
    return str;
  }



  public getNewMobileCode() {
    const passwordGenerator = new PasswordGenerator();
    const options = {
      upperCaseAlpha: false,
      lowerCaseAlpha: false,
      number: true,
      specialCharacter: false,
      minimumLength: 4,
      maximumLength: 4
    };
    let code = passwordGenerator.generatePassword(options);
    return code;
  }

  public getCurrentLanguage(step: GBDialogStep) {
    return step.context.activity.locale;
  }

  public async sendFile(
    min: GBMinInstance,
    step: GBDialogStep,
    mobile: string,
    url: string,
    caption: string
  ): Promise<any> {
    if (step !== null) {
      if (!isNaN(step.context.activity.from.id as any)) {
        mobile = step.context.activity.from.id;
        GBLog.info(`Sending file ${url} to ${mobile}...`);
        const filename = url.substring(url.lastIndexOf('/') + 1);
        await min.whatsAppDirectLine.sendFileToDevice(mobile, url, filename, caption);
      } else {
        GBLog.info(
          `Sending ${url} as file attachment not available in this channel ${step.context.activity.from.id}...`
        );
        await min.conversationalService.sendText(min, step, url);
      }
    } else {
      GBLog.info(`Sending file ${url} to ${mobile}...`);
      const filename = url.substring(url.lastIndexOf('/') + 1);
      await min.whatsAppDirectLine.sendFileToDevice(mobile, url, filename, caption);
    }
  }

  public async sendAudio(min: GBMinInstance, step: GBDialogStep, url: string): Promise<any> {
    const mobile = step.context.activity.from.id;
    GBLog.info(`Sending audio to ${mobile} in URL: ${url}.`);
    await min.whatsAppDirectLine.sendAudioToDevice(mobile, url);
  }

  public async sendEvent(min: GBMinInstance, step: GBDialogStep, name: string, value: Object): Promise<any> {
    if (step.context.activity.channelId === 'webchat') {
      GBLog.info(`Sending event ${name}:${typeof value === 'object' ? JSON.stringify(value) : value} to client...`);
      const msg = MessageFactory.text('');
      msg.value = value;
      msg.type = 'event';
      msg.name = name;

      return await step.context.sendActivity(msg);
    }
  }

  // tslint:disable:no-unsafe-any due to Nexmo.
  public async sendSms(min: GBMinInstance, mobile: string, text: string): Promise<any> {
    GBLog.info(`Sending SMS to ${mobile} with text: '${text}'.`);
    return new Promise((resolve: any, reject: any): any => {
      const nexmo = new Nexmo({
        apiKey: min.instance.smsKey,
        apiSecret: min.instance.smsSecret
      });
      // tslint:disable-next-line:no-unsafe-any
      nexmo.message.sendSms(min.instance.smsServiceNumber, mobile, text, (err, data) => {
        const message = data.messages ? data.messages[0] : {};
        if (err || message['error-text']) {
          GBLog.error(`BASIC: error sending SMS to ${mobile}: ${message['error-text']}`);
          reject(message['error-text']);
        } else {
          resolve(data);
        }
      });
    });
  }

  public async sendToMobile(min: GBMinInstance, mobile: string, message: string) {
    GBLog.info(`Sending message ${message} to ${mobile}...`);
    await min.whatsAppDirectLine.sendToDevice(mobile, message);
  }

  public static async getAudioBufferFromText(speechKey, cloudRegion, text, locale): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      const name = GBAdminService.getRndReadableIdentifier();

      const waveFilename = `work/tmp${name}.pcm`;
      const sdk = require('microsoft-cognitiveservices-speech-sdk');
      sdk.Recognizer.enableTelemetry(false);

      var audioConfig = sdk.AudioConfig.fromAudioFileOutput(waveFilename);
      var speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, cloudRegion);

      var synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      try {
        speechConfig.speechSynthesisLanguage = locale;
        speechConfig.speechSynthesisVoiceName = 'pt-BR-FranciscaNeural';

        synthesizer.speakTextAsync(text, result => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            let raw = Buffer.from(result.audioData);
            fs.writeFileSync(waveFilename, raw);
            GBLog.info(`Audio data byte size: ${result.audioData.byteLength}.`);
            const oggFilenameOnly = `tmp${name}.ogg`;
            const oggFilename = `work/${oggFilenameOnly}`;

            const output = fs.createWriteStream(oggFilename);
            const transcoder = new prism.FFmpeg({
              args: ['-analyzeduration', '0', '-loglevel', '0', '-f', 'opus', '-ar', '16000', '-ac', '1']
            });

            fs.createReadStream(waveFilename).pipe(transcoder).pipe(output);

            let url = urlJoin(GBServer.globals.publicAddress, 'audios', oggFilenameOnly);
            resolve(url);
          } else {
            const error = 'Speech synthesis canceled, ' + result.errorDetails;
            reject(error);
          }
          synthesizer.close();
          synthesizer = undefined;
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public static async getTextFromAudioBuffer(speechKey, cloudRegion, buffer, locale): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      try {
        const oggFile = new Readable();
        oggFile._read = () => { }; // _read is required but you can noop it
        oggFile.push(buffer);
        oggFile.push(null);

        const name = GBAdminService.getRndReadableIdentifier();

        const dest = `work/tmp${name}.wav`;
        const src = `work/tmp${name}.ogg`;
        fs.writeFileSync(src, oggFile.read());

        const makeMp3 = shell([
          'node_modules/ffmpeg-static/ffmpeg.exe',
          '-y',
          '-v',
          'error',
          '-i',
          join(process.cwd(), src),
          '-ar',
          '44100',
          '-ac',
          '1',
          '-acodec',
          'pcm_s16le',
          join(process.cwd(), dest)
        ]);

        exec(makeMp3, error => {
          if (error) {
            GBLog.error(error);
            return Promise.reject(error);
          } else {
            let data = fs.readFileSync(dest);

            const speechToText = new SpeechToTextV1({
              authenticator: new IamAuthenticator({ apikey: process.env.WATSON_STT_KEY }),
              url: process.env.WATSON_STT_URL
            });

            const params = {
              audio: data,
              contentType: 'audio/l16; rate=44100',
              model: 'pt-BR_BroadbandModel'
            };

            speechToText
              .recognize(params)
              .then(response => {
                if (response.result.results.length > 0) {
                  resolve(response.result.results[0].alternatives[0].transcript);
                }
              })
              .catch(error => {
                GBLog.error(error);
                return Promise.reject(error);
              });

            // let pushStream = sdk.AudioInputStream.createPushStream();
            // pushStream.write(data);
            // pushStream.close();

            // let audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
            // let speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
            // speechConfig.speechRecognitionLanguage = locale;
            // let recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            // recognizer.recognizeOnceAsync(
            //   (result) => {

            //     resolve(result.text ? result.text : 'Speech to Text failed: Audio not converted');

            //     recognizer.close();
            //     recognizer = undefined;
            //   },
            //   (err) => {
            //     reject(err);

            //     recognizer.close();
            //     recognizer = undefined;
            //   });
          }
        });
      } catch (error) {
        GBLog.error(error);
        return Promise.reject(error);
      }
    });
  }

  // tslint:enable:no-unsafe-any

  public async sendMarkdownToMobile(min: GBMinInstance, step: GBDialogStep, mobile: string, text: string) {
    let sleep = ms => {
      return new Promise(resolve => {
        setTimeout(resolve, ms);
      });
    };
    enum State {
      InText,
      InImage,
      InImageBegin,
      InImageCaption,
      InImageAddressBegin,
      InImageAddressBody,
      InEmbedBegin,
      InEmbedEnd,
      InEmbedAddressBegin,
      InEmbedAddressEnd,
      InLineBreak,
      InLineBreak1,
      InLineBreak2
    }
    let state = State.InText;
    let currentImage = '';
    let currentText = '';
    let currentCaption = '';
    let currentEmbedUrl = '';

    //![General Bots](/instance/images/gb.png)
    for (let i = 0; i < text.length; i++) {
      const c = text.charAt(i);

      switch (state) {
        case State.InText:
          if (c === '!') {
            state = State.InImageBegin;
          } else if (c === '[') {
            state = State.InEmbedBegin;
          } else if (c === '\n') {
            state = State.InLineBreak;
          } else {
            state = State.InText;
            currentText = currentText.concat(c);
          }
          break;
        case State.InLineBreak:
          if (c === '\n') {
            state = State.InLineBreak1;
          } else if (c === '!') {
            state = State.InImageBegin;
          } else if (c === '[') {
            state = State.InEmbedBegin;
          } else {
            currentText = currentText.concat('\n', c);
            state = State.InText;
          }
          break;
        case State.InLineBreak1:
          if (c === '\n') {
            if (!mobile) {
              await step.context.sendActivity(currentText);
            } else {
              await this.sendToMobile(min, mobile, currentText);
            }
            await sleep(3000);
            currentText = '';
            state = State.InText;
          } else if (c === '!') {
            state = State.InImageBegin;
          } else if (c === '[') {
            state = State.InEmbedBegin;
          } else {
            currentText = currentText.concat('\n', '\n', c);
            state = State.InText;
          }
          break;
        case State.InEmbedBegin:
          if (c === '=') {
            if (currentText !== '') {
              if (!mobile) {
                await step.context.sendActivity(currentText);
              } else {
                await this.sendToMobile(min, mobile, currentText);
              }
              await sleep(3000);
            }
            currentText = '';
            state = State.InEmbedAddressBegin;
          }

          break;
        case State.InEmbedAddressBegin:
          if (c === ']') {
            state = State.InEmbedEnd;
            let url = currentEmbedUrl.startsWith('http')
              ? currentEmbedUrl
              : urlJoin(GBServer.globals.publicAddress, currentEmbedUrl);
            await this.sendFile(min, step, mobile, url, null);
            await sleep(5000);
            currentEmbedUrl = '';
          } else {
            currentEmbedUrl = currentEmbedUrl.concat(c);
          }
          break;
        case State.InEmbedEnd:
          if (c === ']') {
            state = State.InText;
          }
          break;
        case State.InImageBegin:
          if (c === '[') {
            if (currentText !== '') {
              if (!mobile) {
                await step.context.sendActivity(currentText);
              } else {
                await this.sendToMobile(min, mobile, currentText);
              }
              await sleep(2900);
            }
            currentText = '';
            state = State.InImageCaption;
          } else {
            state = State.InText;
            currentText = currentText.concat('!').concat(c);
          }
          break;
        case State.InImageCaption:
          if (c === ']') {
            state = State.InImageAddressBegin;
          } else {
            currentCaption = currentCaption.concat(c);
          }
          break;
        case State.InImageAddressBegin:
          if (c === '(') {
            state = State.InImageAddressBody;
          }
          break;
        case State.InImageAddressBody:
          if (c === ')') {
            state = State.InText;
            let url = currentImage.startsWith('http')
              ? currentImage
              : urlJoin(GBServer.globals.publicAddress, currentImage);
            await this.sendFile(min, step, mobile, url, currentCaption);
            currentCaption = '';
            await sleep(4500);
            currentImage = '';
          } else {
            currentImage = currentImage.concat(c);
          }
          break;
      }
    }
    if (currentText !== '') {
      if (!mobile) {
        GBLog.info(`Sending .MD file to Web.`);
        await step.context.sendActivity(currentText);
      } else {
        GBLog.info(`Sending .MD file to mobile: ${mobile}.`);
        await this.sendToMobile(min, mobile, currentText);
      }
    }
  }

  public async routeNLP(step: GBDialogStep, min: GBMinInstance, text: string): Promise<boolean> {
    if (min.instance.nlpAppId === null || min.instance.nlpAppId === undefined) {
      return false;
    }

    text = text.toLowerCase();
    text = text.replace('who´s', 'who is');
    text = text.replace('who\'s', 'who is');
    text = text.replace('what´s', 'what is');
    text = text.replace('what\'s', 'what is');
    text = text.replace('?', ' ');
    text = text.replace('¿', ' ');
    text = text.replace('!', ' ');
    text = text.replace('.', ' ');
    text = text.replace('/', ' ');
    text = text.replace('\\', ' ');
    text = text.replace('\r\n', ' ');

    const model = new LuisRecognizer({
      applicationId: min.instance.nlpAppId,
      endpointKey: min.instance.nlpKey,
      endpoint: min.instance.nlpEndpoint
    });

    let nlp: RecognizerResult;
    try {
      const saved = step.context.activity.text;
      step.context.activity.text = text;
      nlp = await model.recognize(step.context, {}, {}, { IncludeAllIntents: false, IncludeInstanceData: false, includeAPIResults: true });
      step.context.activity.text = saved;
    } catch (error) {
      // tslint:disable:no-unsafe-any
      if (error.statusCode === 404) {
        GBLog.warn('NLP application still not publish and there are no other options for answering.');

        return false;
      } else {
        const msg = `Error calling NLP, check if you have a published model and assigned keys. Error: ${error.statusCode ? error.statusCode : ''
          } {error.message; }`;

        throw new Error(msg);
      }
      // tslint:enable:no-unsafe-any
    }

    const minBoot = GBServer.globals.minBoot as any;
    let nlpActive = false;
    let score = 0;
    const instanceScore = min.core.getParam(min.instance, 'NLP Score',
      min.instance.nlpScore ? min.instance.nlpScore : minBoot.instance.nlpScore);

    Object.keys(nlp.intents).forEach(name => {
      score = nlp.intents[name].score;
      if (score > instanceScore) {
        nlpActive = true;
      }
    });

    // Resolves intents returned from LUIS.

    const topIntent = LuisRecognizer.topIntent(nlp);
    if (topIntent !== undefined && nlpActive) {
      const intent = topIntent;
      if (intent === 'None') {
        return false;
      }

      GBLog.info(
        `NLP called: ${intent}, entities: ${nlp.entities.length}, score: ${score} > required (nlpScore): ${instanceScore}`
      );

      step.activeDialog.state.options.entities = nlp.entities;

      // FIX MSFT NLP issue.

      if (nlp.entities) {
        await CollectionUtil.asyncForEach(Object.keys(nlp.entities), async key => {
          if (key !== "$instance") {
            let entity = nlp.entities[key];
            if (Array.isArray(entity[0])) {
              nlp.entities[key] = entity.slice(1);
            }
          }
        });
      }

      await step.replaceDialog(`/${intent}`, step.activeDialog.state.options);

      return true;
    }

    GBLog.info(
      `NLP NOT called: score: ${score} > required (nlpScore): ${instanceScore}`
    );

    return false;
  }

  public async getLanguage(min: GBMinInstance, text: string): Promise<string> {
    const key = min.core.getParam<string>(min.instance, 'textAnalyticsKey', null);
    if (!key) {
      return process.env.DEFAULT_USER_LANGUAGE;
    }
    let language = await AzureText.getLocale(
      key,
      min.core.getParam<string>(min.instance, 'textAnalyticsEndpoint', null),
      text
    );

    return language === '(Unknown)' ? 'en' : language;
  }

  public async spellCheck(min: GBMinInstance, text: string): Promise<string> {
    const key =
      min.core.getParam<string>(min.instance, 'spellcheckerKey', null);

    if (key) {
      text = text.charAt(0).toUpperCase() + text.slice(1);
      const data = await AzureText.getSpelledText(key, text);
      if (data !== text) {
        GBLog.info(`Spelling corrected (processMessageActivity): ${data}`);
        text = data;
      }
    }

    return text;
  }

  public async translate(min: GBMinInstance, text: string, language: string): Promise<string> {
    const translatorEnabled = () => {
      if (min.instance.params) {
        const params = JSON.parse(min.instance.params);
        return params ? params['Enable Worldwide Translator'] === 'TRUE' : false;
      }
      return false;
    };
    const endPoint = min.instance.translatorEndpoint;
    const key = min.instance.translatorKey;

    if (endPoint === null || !translatorEnabled() || process.env.TRANSLATOR_DISABLED === 'true') {
      return text;
    }

    if (text.length > 5000) {
      text = text.substr(0, 4999);
      GBLog.warn(`Text that bot will translate will be truncated due to MSFT service limitations.`);
    }
    text = text.replace('¿', '');

    let options = {
      method: 'POST',
      baseUrl: endPoint,
      url: 'translate',
      qs: {
        'api-version': '3.0',
        to: [language]
      },
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': 'westeurope',
        'Content-type': 'application/json',
        'X-ClientTraceId': uuidv4().toString()
      },
      body: [
        {
          text: text
        }
      ],
      json: true
    };

    try {

      const results = await request(options);

      return results[0].translations[0].text;
    } catch (error) {
      const msg = `Error calling Translator service layer. Error is: ${error}.`;

      return Promise.reject(new Error(msg));
    }
  }

  public async prompt(min: GBMinInstance, step: GBDialogStep, text: string) {
    const user = await min.userProfile.get(step.context, {});
    const systemUser = user.systemUser;

    if (text && text !== "") {
      text = await min.conversationalService.translate(
        min,
        text,
        systemUser.locale
          ? systemUser.locale
          : min.core.getParam<string>(min.instance, 'Locale', GBConfigService.get('LOCALE'))
      );
      GBLog.info(`Translated text(prompt): ${text}.`);
    }

    return await step.prompt('textPrompt', text ? text : {});
  }

  public async sendText(min: GBMinInstance, step, text) {
    await this['sendTextWithOptions'](min, step, text, true, null);
  }

  public async sendTextWithOptions(min: GBMinInstance, step, text, translate, keepTextList) {
    const member = step.context.activity.from;
    const user = await min.userProfile.get(step.context, {});
    const systemUser = user.systemUser;

    if (translate) {
      let replacements = [];

      if (keepTextList) {
        keepTextList = keepTextList.filter(p => p.trim() !== '');
        let i = 0;
        await CollectionUtil.asyncForEach(keepTextList, item => {
          if (text.toLowerCase().indexOf(item.toLowerCase()) != -1) {
            const replacementToken = GBAdminService['getNumberIdentifier']();
            replacements[i] = { text: item, replacementToken: replacementToken };
            i++;
            text = text.replace(new RegExp(item.trim(), 'gi'), `${replacementToken}`);
          }
        });
      }

      text = await min.conversationalService.translate(
        min,
        text,
        systemUser.locale
          ? systemUser.locale
          : min.core.getParam<string>(min.instance, 'Locale', GBConfigService.get('LOCALE'))
      );

      if (keepTextList) {
        let i = 0;
        await CollectionUtil.asyncForEach(replacements, item => {
          i++;
          text = text.replace(new RegExp(`${item.replacementToken}`, 'gi'), item.text);
        });
      }

      GBLog.info(`Translated text(sendText): ${text}.`);
    }

    const analytics = new AnalyticsService();
    analytics.createMessage(min.instance.instanceId, user.conversation, null, text);

    if (!isNaN(member.id)) {
      await min.whatsAppDirectLine.sendToDevice(member.id, text);
    } else {
      await step.context.sendActivity(text);
    }


  }

  public async broadcast(min: GBMinInstance, message: string) {
    GBLog.info(`Sending broadcast notifications...`);

    let sleep = ms => {
      return new Promise(resolve => {
        setTimeout(resolve, ms);
      });
    };

    const service = new SecService();
    const users = await service.getAllUsers(min.instance.instanceId);
    await CollectionUtil.asyncForEach(users, async user => {
      if (user.conversationReference) {
        await this.sendOnConversation(min, user, message);
      } else {
        GBLog.info(`User: ${user.systemUserId} with no conversation ID while broadcasting.`);
      }
    });
  }

  /**
   * 
   * Sends a message in a user with an already started conversation (got ConversationReference set)
   */
  public async sendOnConversation(min: GBMinInstance, user: GuaribasUser, message: string) {
    const ref = JSON.parse(user.conversationReference);
    MicrosoftAppCredentials.trustServiceUrl(ref.serviceUrl);
    await min.bot['createConversation'](ref, async (t1) => {
      const ref2 = TurnContext.getConversationReference(t1.activity);
      await min.bot.continueConversation(ref2, async (t2) => {
        await t2.sendActivity(message);
      });
    });
  }

  public static kmpSearch(pattern, text) {
    pattern = pattern.toLowerCase();
    text = text.toLowerCase();
    if (pattern.length == 0)
      return 0; // Immediate match

    // Compute longest suffix-prefix table
    var lsp = [0]; // Base case
    for (var i = 1; i < pattern.length; i++) {
      var j = lsp[i - 1]; // Start by assuming we're extending the previous LSP
      while (j > 0 && pattern.charAt(i) != pattern.charAt(j))
        j = lsp[j - 1];
      if (pattern.charAt(i) == pattern.charAt(j))
        j++;
      lsp.push(j);
    }

    // Walk through text string
    var j = 0; // Number of chars matched in pattern
    for (var i = 0; i < text.length; i++) {
      while (j > 0 && text.charAt(i) != pattern.charAt(j))
        j = lsp[j - 1]; // Fall back in the pattern
      if (text.charAt(i) == pattern.charAt(j)) {
        j++; // Next char matched, increment position
        if (j == pattern.length)
          return i - (j - 1);
      }
    }
    return -1; // Not found
  }

}
