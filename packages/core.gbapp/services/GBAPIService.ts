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

'use strict';

import { TurnContext, BotAdapter } from 'botbuilder';
import { WaterfallStepContext, WaterfallDialog } from 'botbuilder-dialogs';
import { GBLog, GBMinInstance } from 'botlib';
import * as request from 'request-promise-native';
import urlJoin = require('url-join');
import { GBAdminService } from '../../admin.gbapp/services/GBAdminService';
import { AzureDeployerService } from '../../azuredeployer.gbapp/services/AzureDeployerService';
import { GBDeployer } from './GBDeployer';
const MicrosoftGraph = require('@microsoft/microsoft-graph-client');
import { Messages } from '../strings';
import { GBServer } from '../../../src/app';
import { CollectionUtil } from 'pragmatismo-io-framework';
const request = require('request-promise-native');

/**
 * @fileoverview General Bots server core.
 */

/**
 * BASIC system class for extra manipulation of bot behaviour.
 */
class SysClass {
  public min: GBMinInstance;
  private readonly deployer: GBDeployer;

  constructor(min: GBMinInstance, deployer: GBDeployer) {
    this.min = min;
    this.deployer = deployer;
  }

  public async getFileContents(url) {
    const options = {
      url: url,
      method: 'GET',
      encoding: 'binary'
    };

    try {
      const res = await request(options);
      return Buffer.from(res, 'binary').toString();
    } catch (error) {
      throw new Error(error);
    }
  }

  public async getRandomId() {
    return GBAdminService.getRndReadableIdentifier().substr(5);
  }

  public async getStock(symbol) {
    var options = {
      uri: `http://live-nse.herokuapp.com/?symbol=${symbol}`
    };

    let data = await request.get(options);
    return data;
  }

  public async wait(seconds: number) {
    // tslint:disable-next-line no-string-based-set-timeout
    GBLog.info(`BASIC: Talking to a specific user (TALK TO).`);
    const timeout = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await timeout(seconds * 1000);
  }

  public async talkTo(mobile: any, message: string) {
    GBLog.info(`BASIC: Talking '${message}' to a specific user (${mobile}) (TALK TO). `);
    await this.min.conversationalService.sendMarkdownToMobile(this.min, null, mobile, message);
  }

  public async set(file: string, address: string, value: any): Promise<any> {
    GBLog.info(`BASIC: Defining '${address}' in '${file}' to '${value}' (SET). `);
    try {
      let token = await this.min.adminService.acquireElevatedToken(this.min.instance.instanceId);

      let siteId = process.env.STORAGE_SITE_ID;
      let libraryId = process.env.STORAGE_LIBRARY;

      let client = MicrosoftGraph.Client.init({
        authProvider: done => {
          done(null, token);
        }
      });
      const botId = this.min.instance.botId;
      const path = `/${botId}.gbai/${botId}.gbdata`;

      let res = await client
        .api(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/root:${path}:/children`)
        .get();

      let document = res.value.filter(m => {
        return m.name === file;
      });

      if (document === undefined) {
        throw `File '${file}' specified on save GBasic command SET not found. Check the .gbdata or the .gbdialog associated.`;
      }

      let body = { values: [[]] };
      body.values[0][0] = value;

      await client
        .api(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/items/${document[0].id}/workbook/worksheets('Sheet1')/range(address='${address}')`
        )
        .patch(body);
    } catch (error) {
      GBLog.error(`SET BASIC error: ${error.message}`);
      throw error;
    }
  }

  public async save(file: string, ...args): Promise<any> {
    GBLog.info(`BASIC: Saving '${file}' (SAVE). Args: ${args.join(',')}.`);
    try {
      let token = await this.min.adminService.acquireElevatedToken(this.min.instance.instanceId);

      let siteId = process.env.STORAGE_SITE_ID;
      let libraryId = process.env.STORAGE_LIBRARY;

      let client = MicrosoftGraph.Client.init({
        authProvider: done => {
          done(null, token);
        }
      });
      const botId = this.min.instance.botId;
      const path = `/${botId}.gbai/${botId}.gbdata`;

      let res = await client
        .api(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/root:${path}:/children`)
        .get();

      let document = res.value.filter(m => {
        return m.name === file;
      });

      await client
        .api(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/items/${document[0].id}/workbook/worksheets('Sheet1')/range(address='A1:Z1')/insert`
        )
        .post({});

      if (document === undefined) {
        throw `File '${file}' specified on save GBasic command SAVE not found. Check the .gbdata or the .gbdialog associated.`;
      }
      if (args.length > 27) {
        throw `File '${file}' has a SAVE call with more than 27 arguments. Check the .gbdialog associated.`;
      }

      let body = { values: [[]] };

      for (let index = 0; index < 26; index++) {
        body.values[0][index] = args[index];
      }

      let res2 = await client
        .api(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/items/${document[0].id}/workbook/worksheets('Sheet1')/range(address='A2:Z2')`
        )
        .patch(body);
    } catch (error) {
      GBLog.error(`SAVE BASIC error: ${error.message}`);
      throw error;
    }
  }

  public async get(file: string, address: string): Promise<any> {
    let token = await this.min.adminService.acquireElevatedToken(this.min.instance.instanceId);

    let client = MicrosoftGraph.Client.init({
      authProvider: done => {
        done(null, token);
      }
    });
    let siteId = process.env.STORAGE_SITE_ID;
    let libraryId = process.env.STORAGE_LIBRARY;
    const botId = this.min.instance.botId;
    const path = `/${botId}.gbai/${botId}.gbdata`;

    try {
      let res = await client
        .api(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/root:${path}:/children`)
        .get();

      // Performs validation.

      let document = res.value.filter(m => {
        return m.name === file;
      });

      if (!document || document.length === 0) {
        throw `File '${file}' specified on save GBasic command GET not found. Check the .gbdata or the .gbdialog associated.`;
      }

      // Creates workbook session that will be discarded.

      let results = await client
        .api(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/items/${document[0].id}/workbook/worksheets('Sheet1')/range(address='${address}')`
        )
        .get();

      let val = results.text[0][0];
      GBLog.info(`BASIC: Getting '${file}' (GET). Value= ${val}.`);
      return val;

    } catch (error) {
      GBLog.error(error);
    }
  }

  public async findV1(file: string, ...args): Promise<any> {
    let token = await this.min.adminService.acquireElevatedToken(this.min.instance.instanceId);

    let client = MicrosoftGraph.Client.init({
      authProvider: done => {
        done(null, token);
      }
    });
    let siteId = process.env.STORAGE_SITE_ID;
    let libraryId = process.env.STORAGE_LIBRARY;
    const botId = this.min.instance.botId;
    const path = `/${botId}.gbai/${botId}.gbdata`;

    try {
      let res = await client
        .api(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/root:${path}:/children`)
        .get();

      // Performs validation.

      let document = res.value.filter(m => {
        return m.name === file;
      });

      if (document === undefined) {
        throw `File '${file}' specified on save GBasic command FIND not found. Check the .gbdata or the .gbdialog associated.`;
      }
      if (args.length > 1) {
        throw `File '${file}' has a FIND call with more than 1 arguments. Check the .gbdialog associated.`;
      }

      // Creates workbook session that will be discarded.

      const filter = args[0].split('=');
      const columnName = filter[0];
      const value = filter[1];
      let results = await client
        .api(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/items/${document[0].id}/workbook/worksheets('Sheet1')/range(address='A1:Z100')`
        )
        .get();

      let columnIndex = 0;
      const header = results.text[0];
      for (; columnIndex < header.length; columnIndex++) {
        if (header[columnIndex] === columnName) {
          break;
        }
      }

      let foundIndex = 0;
      for (; foundIndex < results.text.length; foundIndex++) {
        if (results.text[foundIndex][columnIndex] === value) {
          break;
        }
      }
      if (foundIndex === results.text.length) {
        return null;
      } else {
        let output = {};
        const row = results.text[foundIndex];
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
          output[header[colIndex]] = row[colIndex];
        }
        output['line'] = foundIndex + 1;
        return output;
      }
    } catch (error) {
      GBLog.error(error);
    }
  }

  public async find(file: string, ...args): Promise<any> {
    let token = await this.min.adminService.acquireElevatedToken(this.min.instance.instanceId);

    let client = MicrosoftGraph.Client.init({
      authProvider: done => {
        done(null, token);
      }
    });
    let siteId = process.env.STORAGE_SITE_ID;
    let libraryId = process.env.STORAGE_LIBRARY;
    const botId = this.min.instance.botId;
    const path = `/${botId}.gbai/${botId}.gbdata`;

    try {
      let res = await client
        .api(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/root:${path}:/children`)
        .get();

      // Performs validation.

      let document = res.value.filter(m => {
        return m.name === file;
      });

      if (document === undefined) {
        throw `File '${file}' specified on save GBasic command FIND not found. Check the .gbdata or the .gbdialog associated.`;
      }
      if (args.length > 1) {
        throw `File '${file}' has a FIND call with more than 1 arguments. Check the .gbdialog associated.`;
      }

      // Creates workbook session that will be discarded.

      const filter = args[0].split('=');
      const columnName = filter[0];
      const value = filter[1];
      let results = await client
        .api(
          `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${libraryId}/drive/items/${document[0].id}/workbook/worksheets('Sheet1')/range(address='A1:Z100')`
        )
        .get();

      let columnIndex = 0;
      const header = results.text[0];
      for (; columnIndex < header.length; columnIndex++) {
        if (header[columnIndex] === columnName) {
          break;
        }
      }

      let array = [];
      let foundIndex = 0;
      for (; foundIndex < results.text.length; foundIndex++) {
        if (results.text[foundIndex][columnIndex] === value) {
          let output = {};
          const row = results.text[foundIndex];
          for (let colIndex = 0; colIndex < row.length; colIndex++) {
            output[header[colIndex]] = row[colIndex];
          }
          output['line'] = foundIndex + 1;
          array.push(output);
        }
      }

      if (array.length === 0) {
        GBLog.info(`BASIC: FIND the data set is empty.`);
        return null;
      } else if (array.length === 1) {
        GBLog.info(`BASIC: FIND single result: ${array[0]}.`);
        return array[0];
      } else {
        GBLog.info(`BASIC: FIND multiple result count: ${array.length}.`);
        return array;
      }
    } catch (error) {
      GBLog.error(error);
    }
  }

  public generatePassword() {
    return GBAdminService.getRndPassword();
  }

  public async createABotFarmUsing(
    botId: string,
    username: string,
    password: string,
    location: string,
    nlpAuthoringKey: string,
    appId: string,
    appPassword: string,
    subscriptionId: string
  ) {
    const service = new AzureDeployerService(this.deployer);
    await service.deployToCloud(
      botId,
      username,
      password,
      location,
      nlpAuthoringKey,
      appId,
      appPassword,
      subscriptionId
    );
  }

  /**
   * Generic function to call any REST API.
   */
  public async sendEmail(to, subject, body) {
    // tslint:disable-next-line:no-console
    GBLog.info(`[E-mail]: to:${to}, subject: ${subject}, body: ${body}.`);
  }

  /**
   * Generic function to call any REST API.
   */
  public async httpGet(url: string) {
    const options = {
      uri: url
    };

    let result = await request.get(options);
    GBLog.info(`[GET]: ${url} : ${result}`);
    return JSON.parse(result);
  }

  /**
   * Generic function to call any REST API by POST.
   */
  public async httpPost(url: string, data) {
    const options = {
      uri: url,
      json: true,
      body: data
    };

    let result = await request.post(options);
    GBLog.info(`[POST]: ${url} (${data}): ${result}`);
    return JSON.parse(result);
  }

  public async numberOnly(text: string) {
    return text.replace(/\D/gi, '');
  }
}

/**
 * Base services of conversation to be called by BASIC.
 */
export class DialogClass {
  public min: GBMinInstance;
  public context: TurnContext;
  public step: WaterfallStepContext;
  public internalSys: SysClass;

  constructor(min: GBMinInstance, deployer: GBDeployer) {
    this.min = min;
    this.internalSys = new SysClass(min, deployer);
  }

  public static setup(bot: BotAdapter, min: GBMinInstance) {
    min.dialogs.add(
      new WaterfallDialog('/gbasic-email', [
        async step => {
          const locale = step.context.activity.locale;
          if ((step.options as any).ask) {
            await min.conversationalService.sendText(min, step, Messages[locale].whats_email);
          }
          return await step.prompt('textPrompt', {});
        },
        async step => {
          const locale = step.context.activity.locale;

          const extractEntity = text => {
            return text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
          };

          const value = extractEntity(step.result);

          if (value === null) {
            await min.conversationalService.sendText(min, step, Messages[locale].validation_enter_valid_email);
            return await step.replaceDialog('/gbasic-email', { ask: true });
          } else {
            return await step.endDialog(value[0]);
          }
        }
      ])
    );
  }

  public sys(): SysClass {
    return this.internalSys;
  }

  public async getToday(step) {
    var d = new Date(),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    const locale = step.context.activity.locale;
    switch (locale) {
      case 'pt-BR':
        return [day, month, year].join('/');

      case 'en-US':
        return [month, day, year].join('/');

      default:
        return [year, month, day].join('/');
    }
  }

  public async getNow(step) {
    var d = new Date();
    return d.getHours() + ':' + d.getMinutes();

    // TODO: Choose Fuse with country code or consent IP.
  }


  public async sendFile(step, filename, caption) {
    if (filename.indexOf('.md') > -1) {
      GBLog.info(`BASIC: Sending the contents of ${filename} markdown to mobile.`);
      let md = await this.min.kbService.getAnswerTextByMediaName(this.min.instance.instanceId, filename);
      await this.min.conversationalService.sendMarkdownToMobile(this.min, step, null, md);
    } else {
      GBLog.info(`BASIC: Sending the file ${filename} to mobile.`);
      let url = urlJoin(
        GBServer.globals.publicAddress,
        'kb',
        `${this.min.botId}.gbai`,
        `${this.min.botId}.gbkb`,
        'assets',
        filename
      );

      await this.min.conversationalService.sendFile(this.min, step, null, url, caption);
    }
  }

  public async getFrom(step) {
    return step.context.activity.from.id;
  }

  public async getUserName(step) {
    return step.context.activity.from.name;
  }

  public async getUserMobile(step) {
    if (isNaN(step.context.activity.from.id)) {
      return 'No mobile available.';
    } else {
      return step.context.activity.from.id;
    }
  }

  public async askEmail(step) {
    return await step.beginDialog('/gbasic-email');
  }

  public async transfer(step) {
    return await step.beginDialog('/t');
  }

  public async hear(step, promise, previousResolve) {
    function random(low, high) {
      return Math.random() * (high - low) + low;
    }
    const idPromise = random(0, 120000000);
    this.min.cbMap[idPromise] = {};
    this.min.cbMap[idPromise].promise = promise;

    const opts = { id: idPromise, previousResolve: previousResolve };
    if (previousResolve !== undefined) {
      previousResolve(opts);
    } else {
      await step.beginDialog('/hear', opts);
    }
  }

  public async talk(step, text: string) {
    return await this.min.conversationalService.sendText(this.min, step, text);
  }
}
