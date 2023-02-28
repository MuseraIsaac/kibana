/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type * as estypes from '@elastic/elasticsearch/lib/api/typesWithBodyKey';
import { ALERT_UUID } from '@kbn/rule-data-utils';

import type { ConfigType } from '../../../../config';
import type { SignalSource, SimpleHit } from '../types';
import type { CompleteRule, RuleParams } from '../../rule_schema';
import { generateId } from '../utils/utils';
import { buildBulkBody } from './utils/build_bulk_body';
import type { BuildReasonMessage } from '../utils/reason_formatters';
import type {
  BaseFieldsLatest,
  WrappedFieldsLatest,
} from '../../../../../common/detection_engine/schemas/alerts';
import type { IRuleExecutionLogForExecutors } from '../../rule_monitoring';

export const wrapHitsFactory =
  ({
    completeRule,
    ignoreFields,
    mergeStrategy,
    spaceId,
    indicesToQuery,
    alertTimestampOverride,
    ruleExecutionLogger,
  }: {
    completeRule: CompleteRule<RuleParams>;
    ignoreFields: ConfigType['alertIgnoreFields'];
    mergeStrategy: ConfigType['alertMergeStrategy'];
    spaceId: string | null | undefined;
    indicesToQuery: string[];
    alertTimestampOverride: Date | undefined;
    ruleExecutionLogger: IRuleExecutionLogForExecutors;
  }) =>
  (
    events: Array<estypes.SearchHit<SignalSource>>,
    buildReasonMessage: BuildReasonMessage
  ): Array<WrappedFieldsLatest<BaseFieldsLatest>> => {
    const wrappedDocs = events.map((event): WrappedFieldsLatest<BaseFieldsLatest> => {
      const id = generateId(
        event._index,
        event._id,
        String(event._version),
        `${spaceId}:${completeRule.alertId}`
      );
      return {
        _id: id,
        _index: '',
        _source: {
          ...buildBulkBody(
            spaceId,
            completeRule,
            event as SimpleHit,
            mergeStrategy,
            ignoreFields,
            true,
            buildReasonMessage,
            indicesToQuery,
            alertTimestampOverride,
            ruleExecutionLogger
          ),
          [ALERT_UUID]: id,
        },
      };
    });
    return wrappedDocs.filter(
      (doc) =>
        !doc._source['kibana.alert.ancestors'].some(
          (ancestor) => ancestor.rule === completeRule.alertId
        )
    );
  };
