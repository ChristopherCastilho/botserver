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

const urlJoin = require('url-join');

const Swagger = require('swagger-client');
const fs = require('fs');
const Path = require('path');
import { GBLog, GBMinInstance, GBService, IGBPackage } from 'botlib';
import { CollectionUtil } from 'pragmatismo-io-framework';
import * as request from 'request-promise-native';
import { GBServer } from '../../../src/app';
import { GBConversationalService } from '../../core.gbapp/services/GBConversationalService';
import { SecService } from '../../security.gbapp/services/SecService';
import { Messages } from '../strings';
import { GuaribasUser } from '../../security.gbapp/models';
import { DialogKeywords } from '../../basic.gblib/services/DialogKeywords';
import { GBAdminService } from '../../admin.gbapp/services/GBAdminService';
const { MessageMedia, Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

/**
 * Support for Whatsapp.
 */
export class WhatsappDirectLine extends GBService {

  public static conversationIds = {};
  public static mobiles = {};
  public static phones = {};
  public static chatIds = {};
  public static usernames = {};
  public static state = {}; // 2: Waiting, 3: MessageArrived.
  public static lastMessage = {}; // 2: Waiting, 3: MessageArrived.

  public pollInterval = 3000;
  public directLineClientName = 'DirectLineClient';

  public directLineClient: any;
  public whatsappServiceKey: string;
  public whatsappServiceNumber: string;
  public whatsappServiceUrl: string;
  public botId: string;
  public min: GBMinInstance;
  private directLineSecret: string;
  private locale: string = 'pt-BR';
  provider: any;
  INSTANCE_URL = 'https://api.maytapi.com/api';
  private customClient;

  constructor(
    min: GBMinInstance,
    botId,
    directLineSecret,
    whatsappServiceKey,
    whatsappServiceNumber,
    whatsappServiceUrl
  ) {
    super();

    this.min = min;
    this.botId = botId;
    this.directLineSecret = directLineSecret;
    this.whatsappServiceKey = whatsappServiceKey;
    this.whatsappServiceNumber = whatsappServiceNumber;
    this.whatsappServiceUrl = whatsappServiceUrl;
    this.provider = whatsappServiceKey === "internal" ?
      'GeneralBots' : whatsappServiceNumber.indexOf(';') > -1 ? 'maytapi' : 'chatapi';
  }

  public static async asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

  public async setup(setUrl) {

    this.directLineClient =
      new Swagger({
        spec: JSON.parse(fs.readFileSync('directline-3.0.json', 'utf8')), usePromise: true
      });
    const client = await this.directLineClient;

    client.clientAuthorizations.add(
      'AuthorizationBotConnector',
      new Swagger.ApiKeyAuthorization('Authorization', `Bearer ${this.directLineSecret}`, 'header')
    );
    let options;

    switch (this.provider) {
      case 'GeneralBots':

        // Initialize the browser using a local profile for each bot.

        const gbaiName = `${this.min.botId}.gbai`;
        let localName = Path.join('work', gbaiName, 'profile');
        let client = this.customClient = new Client({
          authStrategy: new LocalAuth(),
          puppeteer: {
            headless: false, args: ['--disable-features=site-per-process',
              `--user-data-dir=${localName}`]
          }
        });
        client.initialize();

        // Dispatches messages to the received method.

        client.on('message', (async message => {
          await this.received(message, null);
        }).bind(this));

        client.on('qr', (async (qr) => {

          const adminNumber = this.min.core.getParam(this.min.instance, 'Bot Admin Number', null);
          const adminEmail = this.min.core.getParam(this.min.instance, 'Bot Admin E-mail', null);

          // Sends QR Code to boot bot admin.

          const msg = `Please, scan QR Code with for bot ${this.botId}.`;
          GBLog.info(msg);
          qrcode.generate(qr, { small: true, scale: 0.5 });


          // While handling other bots uses boot instance of this class to send QR Codes.

          if (this.botId !== GBServer.globals.minBoot.botId) {

            const s = new DialogKeywords(null, null, null, null);
            const qrBuf = await s.getQRCode(qr);
            const gbaiName = `${this.min.botId}.gbai`;
            const localName = Path.join('work', gbaiName, 'cache', `qr${GBAdminService.getRndReadableIdentifier()}.png`);
            fs.writeFileSync(localName, qrBuf);
            const url = urlJoin(
              GBServer.globals.publicAddress,
              this.min.botId,
              'cache',
              Path.basename(localName)
            );
            GBServer.globals.minBoot.whatsAppDirectLine.sendFileToDevice(adminNumber, url, Path.basename(localName), msg);
            s.sendEmail(adminEmail, `Check your WhatsApp for bot ${this.botId}`, msg);
          }

        }).bind(this));

        client.on('authenticated', () => {
          GBLog.info(`WhatsApp QR Code authenticated for ${this.botId}.`);
        });

        setUrl = false;
        break;

      case 'chatapi':

        options = {
          method: 'POST',
          url: urlJoin(this.whatsappServiceUrl, 'webhook'),
          timeout: 10000,
          qs: {
            token: this.whatsappServiceKey,
            webhookUrl: `${GBServer.globals.publicAddress}/webhooks/whatsapp/${this.botId}`,
            set: true
          },
          headers: {
            'cache-control': 'no-cache'
          }
        };

        break;
      case 'maytapi':

        let phoneId = this.whatsappServiceNumber.split(';')[0];
        let productId = this.whatsappServiceNumber.split(';')[1]
        let url = `${this.INSTANCE_URL}/${productId}/${phoneId}/config`;
        WhatsappDirectLine.phones[phoneId] = this.botId;

        options = {
          url: url,
          method: 'POST',
          body: {
            webhook: `${GBServer.globals.publicAddress}/webhooks/whatsapp/${this.botId}`,
            "ack_delivery": false
          },
          headers: {
            'x-maytapi-key': this.whatsappServiceKey,
            'Content-Type': 'application/json',
          },
          json: true,
        };
        break;
    }

    if (setUrl) {
      const express = require('express');
      GBServer.globals.server.use(`/audios`, express.static('work'));


      try {
        const res = await request.post(options);
      } catch (error) {
        GBLog.error(`Error initializing 3rd party Whatsapp provider(1) ${error.message}`);
      }
    }
  }

  public async resetConversationId(botId, number, group = '') {
    WhatsappDirectLine.conversationIds[botId + number + group] = undefined;
  }

  public async check() {

    GBLog.info(`GBWhatsapp: Checking server...`);

    const options = {
      url: urlJoin(this.whatsappServiceUrl, 'status') + `?token=${this.min.instance.whatsappServiceKey}`,
      method: 'GET'
    };

    const res = await request(options);
    const json = JSON.parse(res);

    return json.accountStatus === 'authenticated';
  }

  public static providerFromRequest(req) {
    return req.body.messages ? 'chatapi' :
      req.body.message ? 'maytapi' : 'GeneralBots';
  }

  public async received(req, res) {

    const provider = WhatsappDirectLine.providerFromRequest(req);

    let message, from, fromName, text;
    let group = "";
    let answerText = null;

    switch (provider) {
      case 'GeneralBots':
        message = req;
        text = message.body;
        from = message.from.split('@')[0];
        fromName = message._data.notifyName;

        break;

      case 'chatapi':
        message = req.body.messages[0];
        text = message.body;
        from = req.body.messages[0].author.split('@')[0];
        fromName = req.body.messages[0].senderName;

        if (req.body.messages[0].fromMe) {
          res.end();

          return; // Exit here.
        }

        break;

      case 'maytapi':
        message = req.body.message;
        text = message.text;
        from = req.body.user.phone;
        fromName = req.body.user.name;

        if (req.body.message.fromMe) {
          res.end();

          return; // Exit here.
        }
        break;
    }

    text = text.replace(/\@\d+ /gi, '');
    GBLog.info(`GBWhatsapp: RCV ${from}(${fromName}): ${text})`);

    if (provider === "chatapi") {
      if (message.chatName.charAt(0) !== '+') {
        group = message.chatName;

        let botGroupName = this.min.core.getParam<string>(this.min.instance, 'WhatsApp Group Name', null);
        let botShortcuts = this.min.core.getParam<string>(this.min.instance, 'WhatsApp Group Shortcuts', null);
        if (!botShortcuts) {
          botShortcuts = new Array()
        }
        else {
          botShortcuts = botShortcuts.split(' ');
        }

        const parts = text.split(' ');

        // Bot name must be specified on config.

        if (botGroupName === group) {

          // Shortcut has been mentioned?

          let found = false;
          parts.forEach(e1 => {
            botShortcuts.forEach(e2 => {
              if (e1 === e2 && !found) {
                found = true;
                text = text.replace(e2, '');
              }
            });


            // Verify if it is a group cache answer.

            const questions = this.min['groupCache'];
            if (questions && questions.length > 0) {
              questions.forEach(q => {
                if (q.content === e1 && !found) {
                  const answer = this.min.kbService['getAnswerById'](this.min.instance.instanceId,
                    q.answerId);
                  answerText = answer.content;
                }
              });
            }


            // Ignore group messages without the mention to Bot.

            let smsServiceNumber = this.min.core.getParam<string>(this.min.instance, 'whatsappServiceNumber', null);
            if (smsServiceNumber && !answerText) {
              smsServiceNumber = smsServiceNumber.replace('+', '');
              if (!message.body.startsWith('@' + smsServiceNumber)) {
                return;
              }
            }

          });
        }
      }
    }

    const botId = this.min.instance.botId;
    const state = WhatsappDirectLine.state[botId + from];
    if (state) {
      WhatsappDirectLine.state[botId + from] = null;
      await state.promise(null, message.text);

      return; // Exit here.
    };


    // Processes .gbapp message interception.

    await CollectionUtil.asyncForEach(this.min.appPackages, async (e: IGBPackage) => {
      await e.onExchangeData(this.min, 'whatsappMessage', message);
    });

    const sec = new SecService();
    const user = await sec.ensureUser(this.min.instance.instanceId, from,
      fromName, '', 'whatsapp', fromName, null);
    const locale = user.locale ? user.locale : 'pt';

    if (answerText) {
      await this.sendToDeviceEx(user.userSystemId, answerText, locale, null);

      return; // Exit here.
    }

    if (message.type === 'ptt') {

      if (process.env.AUDIO_DISABLED !== 'true') {
        const options = {
          url: provider ? message.body : message.text,
          method: 'GET',
          encoding: 'binary'
        };

        const res = await request(options);
        const buf = Buffer.from(res, 'binary');
        text = await GBConversationalService.getTextFromAudioBuffer(
          this.min.instance.speechKey,
          this.min.instance.cloudLocation,
          buf, locale
        );
      } else {
        await this.sendToDevice(user.userSystemId,
          `No momento estou apenas conseguindo ler mensagens de texto.`, null);
      }
    }

    const conversationId = WhatsappDirectLine.conversationIds[botId + from + group];
    const client = await this.directLineClient;
    WhatsappDirectLine.lastMessage[botId + from] = message;

    // Check if this message is from a Human Agent itself.

    if (user.agentMode === 'self') {

      // Check if there is someone being handled by this Human Agent.

      const manualUser = await sec.getUserFromAgentSystemId(from);
      if (manualUser === null) {

        await sec.updateHumanAgent(from, this.min.instance.instanceId, null);

      } else {
        const agent = await sec.getUserFromSystemId(user.agentSystemId);

        const cmd = '/reply ';
        if (text.startsWith(cmd)) {
          const filename = text.substr(cmd.length);
          const message = await this.min.kbService.getAnswerTextByMediaName(this.min.instance.instanceId, filename);

          if (message === null) {
            await this.sendToDeviceEx(user.userSystemId, `File ${filename} not found in any .gbkb published. Check the name or publish again the associated .gbkb.`,
              locale, null);
          } else {
            await this.min.conversationalService.sendMarkdownToMobile(this.min, null, user.userSystemId, message);
          }
        } else if (text === '/qt') {
          // TODO: Transfers only in pt-br for now.
          await this.sendToDeviceEx(manualUser.userSystemId,
            Messages[this.locale].notify_end_transfer(this.min.instance.botId), locale, null);

          if (user.agentSystemId.charAt(2) === ":") { // Agent is from Teams.
            await this.min.conversationalService['sendOnConversation'](this.min, agent, Messages[this.locale].notify_end_transfer(this.min.instance.botId));
          }
          else {
            await this.sendToDeviceEx(user.agentSystemId,
              Messages[this.locale].notify_end_transfer(this.min.instance.botId), locale, null);

          }
          await sec.updateHumanAgent(manualUser.userSystemId, this.min.instance.instanceId, null);
          await sec.updateHumanAgent(user.agentSystemId, this.min.instance.instanceId, null);
        } else {
          GBLog.info(`HUMAN AGENT (${manualUser.agentSystemId}) TO USER ${manualUser.userSystemId}: ${text}`);
          await this.sendToDeviceEx(manualUser.userSystemId, `AGENTE: *${text}*`, locale, null);
        }
      }


    } else if (user.agentMode === 'human') {

      const agent = await sec.getUserFromSystemId(user.agentSystemId);
      if (text === '/t') {
        await this.sendToDeviceEx(user.userSystemId, `Você já está sendo atendido por ${agent.userSystemId}.`, locale, null);
      } else if (text === '/qt' || text === 'Sair' || text === 'Fechar') {
        // TODO: Transfers only in pt-br for now.
        await this.endTransfer(from, locale, user, agent, sec);
      } else {
        GBLog.info(`USER (${from}) TO AGENT ${agent.userSystemId}: ${text}`);

        if (user.agentSystemId.charAt(2) === ":" || agent.userSystemId.indexOf("@") > -1) { // Agent is from Teams or Google Chat.
          await this.min.conversationalService['sendOnConversation'](this.min, agent, text);
        }
        else {
          await this.sendToDeviceEx(user.agentSystemId, `Bot: ${this.min.instance.botId}\n${from}: ${text}`, locale, null);
        }

      }

    } else if (user.agentMode === 'bot' || user.agentMode === null || user.agentMode === undefined) {

      if (WhatsappDirectLine.conversationIds[botId + from + group] === undefined) {
        GBLog.info(`GBWhatsapp: Starting new conversation on Bot.`);
        const response = await client.Conversations.Conversations_StartConversation();
        const generatedConversationId = response.obj.conversationId;

        WhatsappDirectLine.conversationIds[botId + from + group] = generatedConversationId;
        if (provider === "GeneralBots") {
          WhatsappDirectLine.chatIds[generatedConversationId] = message.from;
        }
        WhatsappDirectLine.mobiles[generatedConversationId] = from;
        WhatsappDirectLine.usernames[from] = fromName;
        WhatsappDirectLine.chatIds[generatedConversationId] = message.chatId;


        this.pollMessages(client, generatedConversationId, from, fromName);
        this.inputMessage(client, generatedConversationId, text, from, fromName, group);
      } else {

        this.inputMessage(client, conversationId, text, from, fromName, group);
      }
    } else {
      GBLog.warn(`Inconsistencty found: Invalid agentMode on User Table: ${user.agentMode}`);
    }

    res.end();

  }

  private async endTransfer(id: any, locale: string, user: GuaribasUser, agent: GuaribasUser, sec: SecService) {
    await this.sendToDeviceEx(id,
      Messages[this.locale].notify_end_transfer(this.min.instance.botId), locale, null);

    if (user.agentSystemId.charAt(2) === ":") { // Agent is from Teams.
      await this.min.conversationalService['sendOnConversation'](this.min, agent, Messages[this.locale].notify_end_transfer(this.min.instance.botId));
    }
    else {
      await this.sendToDeviceEx(user.agentSystemId, Messages[this.locale].notify_end_transfer(this.min.instance.botId), locale, null);
    }

    await sec.updateHumanAgent(id, this.min.instance.instanceId, null);
  }

  public inputMessage(client, conversationId, text, from, fromName, group) {
    return client.Conversations.Conversations_PostActivity({
      conversationId: conversationId,
      activity: {
        textFormat: 'plain',
        text: text,
        type: 'message',
        mobile: from,
        group: group,
        from: {
          id: from,
          name: fromName
        },
        replyToId: from
      }
    });
  }

  public pollMessages(client, conversationId, from, fromName) {
    GBLog.info(`GBWhatsapp: Starting message polling(${from}, ${conversationId}).`);

    let watermark: any;

    const worker = async () => {
      try {
        const response = await client.Conversations.Conversations_GetActivities({
          conversationId: conversationId,
          watermark: watermark
        });
        watermark = response.obj.watermark;
        await this.printMessages(response.obj.activities, conversationId, from, fromName);
      } catch (err) {
        GBLog.error(`Error calling printMessages on Whatsapp channel ${err.data === undefined ? err : err.data}`);
      }
    };
    setInterval(worker, this.pollInterval);
  }

  public async printMessages(activities, conversationId, from, fromName) {
    if (activities && activities.length) {
      // Ignore own messages.

      activities = activities.filter(m => m.from.id === this.botId && m.type === 'message');

      if (activities.length) {
        // Print other messages.

        await WhatsappDirectLine.asyncForEach(activities, async activity => {
          await this.printMessage(activity, conversationId, from, fromName);
        });
      }
    }
  }

  public async printMessage(activity, conversationId, from, fromName) {
    let output = '';

    if (activity.text) {
      GBLog.info(`GBWhatsapp: SND ${from}(${fromName}): ${activity.text}`);
      output = activity.text;
    }

    if (activity.attachments) {
      activity.attachments.forEach(attachment => {
        switch (attachment.contentType) {
          case 'application/vnd.microsoft.card.hero':
            output += `\n${this.renderHeroCard(attachment)}`;
            break;

          case 'image/png':
            GBLog.info(`Opening the requested image ${attachment.contentUrl}`);
            output += `\n${attachment.contentUrl}`;
            break;
          default:
            GBLog.info(`Unknown content type: ${attachment.contentType}`);
        }
      });
    }

    await this.sendToDevice(from, output, conversationId);
  }

  public renderHeroCard(attachment) {
    return `${attachment.content.title} - ${attachment.content.text}`;
  }

  public async sendFileToDevice(to, url, filename, caption, chatId) {

    let options;
    switch (this.provider) {
      case 'GeneralBots':
        const attachment = MessageMedia.fromurl(url);
        await this.customClient.sendMessage(to, attachment, { caption: caption });
        break;

      case 'chatapi':

        options = {
          method: 'POST',
          url: urlJoin(this.whatsappServiceUrl, 'sendFile'),
          qs: {
            token: this.whatsappServiceKey,
            phone: to,
            body: url,
            filename: filename,
            caption: caption
          },
          headers: {
            'cache-control': 'no-cache'
          }
        };

        break;
      case 'maytapi':

        let contents = 0;
        let body = {
          to_number: to,
          type: "media",
          message: url,
          text: caption
        };

        let phoneId = this.whatsappServiceNumber.split(';')[0];
        let productId = this.whatsappServiceNumber.split(';')[1]

        options = {
          url: `${this.INSTANCE_URL}/${productId}/${phoneId}/sendMessage`,
          method: 'post',
          json: true,
          body,
          headers: {
            'Content-Type': 'application/json',
            'x-maytapi-key': this.whatsappServiceKey,
          },
        };

        break;
    }
    try {
      // tslint:disable-next-line: await-promise
      const result = await request.post(options);
      GBLog.info(`File ${url} sent to ${to}: ${result}`);
    } catch (error) {
      GBLog.error(`Error sending file to Whatsapp provider ${error.message}`);
    }
  }

  public async sendAudioToDevice(to, url, chatId) {

    let options;
    switch (this.provider) {
      case 'GeneralBots':

        const attachment = MessageMedia.fromurl(url);
        await this.customClient.sendMessage(to, attachment);

        break;

      case 'chatapi':

        options = {
          method: 'POST',
          url: urlJoin(this.whatsappServiceUrl, 'sendPTT'),
          qs: {
            token: this.whatsappServiceKey,
            phone: chatId ? null : to,
            chatId: chatId,
            body: url
          },
          headers: {
            'cache-control': 'no-cache'
          }
        };

        break;
      case 'maytapi':

        options = {}; // TODO: Code Maytapi.

        break;
    }

    try {

      // tslint:disable-next-line: await-promise
      const result = await request.post(options);
      GBLog.info(`Audio ${url} sent to ${to}: ${result}`);
    } catch (error) {
      GBLog.error(`Error sending audio message to Whatsapp provider ${error.message}`);
    }
  }

  public async sendTextAsAudioToDevice(to, msg, chatId) {

    const url = await GBConversationalService.getAudioBufferFromText(
      msg
    );

    await this.sendFileToDevice(to, url, 'Audio', msg, chatId);
  }

  public async sendToDevice(to: string, msg: string, conversationId) {

    const cmd = '/audio ';

    let chatId = WhatsappDirectLine.chatIds[conversationId];

    if (msg.startsWith(cmd)) {
      msg = msg.substr(cmd.length);

      return await this.sendTextAsAudioToDevice(to, msg, chatId);
    } else {

      let options;

      switch (this.provider) {
        case 'GeneralBots':

          this.customClient.sendMessage(to + '@c.us', msg);

          break;

        case 'chatapi':


          options = {
            method: 'POST',
            url: urlJoin(this.whatsappServiceUrl, 'message'),
            qs: {
              token: this.whatsappServiceKey,
              phone: chatId ? null : to,
              chatId: chatId,
              body: msg
            },
            headers: {
              'cache-control': 'no-cache'
            }
          };
          break;
        case 'maytapi':
          let phoneId = this.whatsappServiceNumber.split(';')[0];
          let productId = this.whatsappServiceNumber.split(';')[1]
          let url = `${this.INSTANCE_URL}/${productId}/${phoneId}/sendMessage`;

          options = {
            url: url,
            method: 'post',
            json: true,
            body: { type: 'text', message: msg, to_number: to },
            headers: {
              'Content-Type': 'application/json',
              'x-maytapi-key': this.whatsappServiceKey,
            },
          };
          break;
      }

      try {
        // tslint:disable-next-line: await-promise
        if (this.provider !== "GeneralBots") {
          await request.post(options);
        }
        GBLog.info(`Message [${msg}] sent to ${to}.`);

      } catch (error) {
        GBLog.error(`Error sending message to Whatsapp provider ${error.message}`);

        // TODO: Handle Error: socket hang up and retry.
      }
    }
  }

  public async sendToDeviceEx(to, text, locale, conversationId) {
    text = await this.min.conversationalService.translate(
      this.min,
      text,
      locale
    );
    await this.sendToDevice(to, text, conversationId);

  }
}
