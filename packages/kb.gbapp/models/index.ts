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
 * @fileoverview General Bots server core.
 */

'use strict';

import {
  AutoIncrement,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  HasMany,
  HasOne,
  IsUUID,
  Length,
  Model,
  PrimaryKey,
  Sequelize,
  Table,
  UpdatedAt
} from 'sequelize-typescript';

import {
  GuaribasInstance,
  GuaribasPackage
} from '../../core.gbapp/models/GBModel';
import { GuaribasUser } from '../../security.gbapp/models';

/**
 * Subjects to group the pair of questions and answers.
 */
@Table
export class GuaribasSubject extends Model<GuaribasSubject> {
  @PrimaryKey
  @AutoIncrement
  @Column (DataType.STRING(255)) 
  public subjectId: number;

  @Column (DataType.STRING(255)) 
public internalId: string;

  @Column (DataType.STRING(255)) 
public title: string;

  @Column(DataType.STRING(512))
  @Column (DataType.STRING(255)) 
  public description: string;

  @Column (DataType.STRING(255)) 
public from: string;

  @Column (DataType.STRING(255)) 
public to: string;

  @ForeignKey(() => GuaribasSubject)
  @Column (DataType.STRING(255)) 
  public parentSubjectId: number;

  @BelongsTo(() => GuaribasSubject, 'parentSubjectId')
  public parentSubject: GuaribasSubject;

  @HasMany(() => GuaribasSubject, { foreignKey: 'parentSubjectId' })
  public childrenSubjects: GuaribasSubject[];

  @ForeignKey(() => GuaribasInstance)
  @Column (DataType.STRING(255)) 
  public instanceId: number;

  @BelongsTo(() => GuaribasInstance)
  public instance: GuaribasInstance;

  @ForeignKey(() => GuaribasUser)
  @Column (DataType.STRING(255)) 
  public responsibleUserId: number;

  @BelongsTo(() => GuaribasUser)
  public responsibleUser: GuaribasUser;

  @ForeignKey(() => GuaribasPackage)
  @Column (DataType.STRING(255)) 
  public packageId: number;

  @BelongsTo(() => GuaribasPackage)
  public package: GuaribasPackage;
}

/**
 * A question and its metadata.
 */
@Table
export class GuaribasQuestion extends Model<GuaribasQuestion> {
  @PrimaryKey
  @AutoIncrement
  @Column (DataType.STRING(255)) 
  public questionId: number;

  @Column(DataType.STRING(64))
  @Column (DataType.STRING(255)) 
  public subject1: string;

  @Column(DataType.STRING(64))
  @Column (DataType.STRING(255)) 
  public subject2: string;

  @Column(DataType.STRING(64))
  @Column (DataType.STRING(255)) 
  public subject3: string;

  @Column(DataType.STRING(64))
  @Column (DataType.STRING(255)) 
  public subject4: string;

  @Column(DataType.STRING(1024))
  @Column (DataType.STRING(255)) 
  public keywords: string;

  @Column (DataType.STRING(255)) 
  public skipIndex: boolean;

  @Column(DataType.STRING(512))
  public from: string;

  @Column(DataType.STRING(512))
  public to: string;

  @Column(DataType.TEXT)
  public content: string;

    @Column(DataType.DATE)
  @CreatedAt
  public createdAt: Date;

  @Column(DataType.DATE)
  @UpdatedAt
  public updatedAt: Date;


  //tslint:disable-next-line:no-use-before-declare
  @ForeignKey(() => GuaribasAnswer)
  @Column (DataType.STRING(255)) 
  public answerId: number;

  @BelongsTo(() => GuaribasInstance)
  public instance: GuaribasInstance;

  @ForeignKey(() => GuaribasInstance)
  @Column (DataType.STRING(255)) 
  public instanceId: number;

  @ForeignKey(() => GuaribasPackage)
  @Column (DataType.STRING(255)) 
  public packageId: number;

  @BelongsTo(() => GuaribasPackage)
  public package: GuaribasPackage;
}

/**
 * An answer and its metadata.
 */
@Table
export class GuaribasAnswer extends Model<GuaribasAnswer> {
  @PrimaryKey
  @AutoIncrement
  @Column (DataType.STRING(255)) 
  public answerId: number;

  @Length({ min: 0, max: 512 })
  @Column (DataType.STRING(255)) 
  public media: string;

  @Length({ min: 0, max: 12 })
  @Column (DataType.STRING(255)) 
  public format: string;

  @Column(DataType.TEXT)
  public content: string;

    @Column(DataType.DATE)
  @CreatedAt
  public createdAt: Date;

  @Column(DataType.DATE)
  @UpdatedAt
  public updatedAt: Date;


  @HasMany(() => GuaribasQuestion)
  public questions: GuaribasQuestion[];

  @HasOne(() => GuaribasQuestion)
  public prev: GuaribasQuestion;

  @HasOne(() => GuaribasQuestion)
  public next: GuaribasQuestion;

  @ForeignKey(() => GuaribasQuestion)
  @Column (DataType.STRING(255)) 
  public nextId: number;

  @ForeignKey(() => GuaribasQuestion)
  @Column (DataType.STRING(255)) 
  public prevId: number;

  @ForeignKey(() => GuaribasInstance)
  @Column (DataType.STRING(255)) 
  public instanceId: number;

  @ForeignKey(() => GuaribasPackage)
  @Column (DataType.STRING(255)) 
  public packageId: number;

  @BelongsTo(() => GuaribasPackage)
  public package: GuaribasPackage;
}
