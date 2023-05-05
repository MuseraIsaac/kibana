/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rangeQuery, termQuery } from '@kbn/observability-plugin/server';
import { ApmRuleType } from '../../../../../common/rules/apm_rule_types';
import {
  SERVICE_NAME,
  TRANSACTION_TYPE,
  TRANSACTION_NAME,
  EVENT_OUTCOME,
} from '../../../../../common/es_fields/apm';
import { environmentQuery } from '../../../../../common/utils/environment_query';
import { AlertParams } from '../../route';
import {
  getSearchTransactionsEvents,
  getDocumentTypeFilterForTransactions,
  getProcessorEventForTransactions,
} from '../../../../lib/helpers/transactions';
import { APMConfig } from '../../../..';
import { APMEventClient } from '../../../../lib/helpers/create_es_client/create_apm_event_client';
import { getAllGroupByFields } from '../utils/get_all_groupby_fields';
import { EventOutcome } from '../../../../../common/event_outcome';
import { getGroupByTerms } from '../utils/get_groupby_terms';

export type TransactionErrorRateChartPreviewResponse = Array<{
  name: string;
  data: Array<{ x: number; y: number | null }>;
}>;

export async function getTransactionErrorRateChartPreview({
  config,
  apmEventClient,
  alertParams,
}: {
  config: APMConfig;
  apmEventClient: APMEventClient;
  alertParams: AlertParams;
}): Promise<TransactionErrorRateChartPreviewResponse> {
  const {
    serviceName,
    environment,
    transactionType,
    interval,
    start,
    end,
    transactionName,
    groupBy,
  } = alertParams;

  const searchAggregatedTransactions = await getSearchTransactionsEvents({
    config,
    apmEventClient,
    kuery: '',
  });

  const allGroupByFields = getAllGroupByFields(
    ApmRuleType.TransactionErrorRate,
    groupBy
  );

  const params = {
    apm: {
      events: [getProcessorEventForTransactions(searchAggregatedTransactions)],
    },
    body: {
      track_total_hits: false,
      size: 0,
      query: {
        bool: {
          filter: [
            ...termQuery(SERVICE_NAME, serviceName, {
              queryEmptyString: false,
            }),
            ...termQuery(TRANSACTION_TYPE, transactionType, {
              queryEmptyString: false,
            }),
            ...termQuery(TRANSACTION_NAME, transactionName, {
              queryEmptyString: false,
            }),
            ...rangeQuery(start, end),
            ...environmentQuery(environment),
            ...getDocumentTypeFilterForTransactions(
              searchAggregatedTransactions
            ),
            {
              terms: {
                [EVENT_OUTCOME]: [EventOutcome.failure, EventOutcome.success],
              },
            },
          ],
        },
      },
      aggs: {
        timeseries: {
          date_histogram: {
            field: '@timestamp',
            fixed_interval: interval,
            extended_bounds: {
              min: start,
              max: end,
            },
          },
          aggs: {
            series: {
              multi_terms: {
                terms: [...getGroupByTerms(allGroupByFields)],
                size: 3,
                order: { _count: 'desc' as const },
              },
              aggs: {
                outcomes: {
                  terms: {
                    field: EVENT_OUTCOME,
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const resp = await apmEventClient.search(
    'get_transaction_error_rate_chart_preview',
    params
  );

  if (!resp.aggregations) {
    return [];
  }

  const seriesDataMap = resp.aggregations.timeseries.buckets.reduce(
    (acc, bucket) => {
      const x = bucket.key;
      bucket.series.buckets.forEach((seriesBucket) => {
        const bucketKey = seriesBucket.key.join('_');
        const y = calculateErrorRate(seriesBucket.outcomes.buckets);

        if (acc[bucketKey]) {
          acc[bucketKey].push({ x, y });
        } else {
          acc[bucketKey] = [{ x, y }];
        }
      });

      return acc;
    },
    {} as Record<string, Array<{ x: number; y: number | null }>>
  );

  return Object.keys(seriesDataMap).map((key) => ({
    name: key,
    data: seriesDataMap[key],
  }));
}

const calculateErrorRate = (
  buckets: Array<{
    doc_count: number;
    key: string | number;
  }>
) => {
  const failed =
    buckets.find((outcomeBucket) => outcomeBucket.key === EventOutcome.failure)
      ?.doc_count ?? 0;

  const succesful =
    buckets.find((outcomeBucket) => outcomeBucket.key === EventOutcome.success)
      ?.doc_count ?? 0;

  return (failed / (failed + succesful)) * 100;
};
