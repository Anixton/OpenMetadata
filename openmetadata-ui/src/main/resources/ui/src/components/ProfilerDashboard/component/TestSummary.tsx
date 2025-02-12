/*
 *  Copyright 2022 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { Col, Row, Space, Typography } from 'antd';
import { AxiosError } from 'axios';
import { t } from 'i18next';
import {
  first,
  isEmpty,
  isEqual,
  isUndefined,
  omitBy,
  pick,
  round,
  uniqueId,
} from 'lodash';
import { DateRangeObject } from 'Models';
import React, {
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  LineProps,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Payload } from 'recharts/types/component/DefaultLegendContent';
import { ReactComponent as FilterPlaceHolderIcon } from '../../../assets/svg/no-search-placeholder.svg';
import {
  GREEN_3,
  GREEN_3_OPACITY,
  RED_3,
  RED_3_OPACITY,
  YELLOW_2,
} from '../../../constants/Color.constants';
import { GRAPH_BACKGROUND_COLOR } from '../../../constants/constants';
import {
  COLORS,
  PROFILER_FILTER_RANGE,
} from '../../../constants/profiler.constant';
import { CSMode } from '../../../enums/codemirror.enum';
import { ERROR_PLACEHOLDER_TYPE } from '../../../enums/common.enum';
import {
  Thread,
  ThreadTaskStatus,
} from '../../../generated/entity/feed/thread';
import {
  TestCaseParameterValue,
  TestCaseResult,
  TestCaseStatus,
} from '../../../generated/tests/testCase';
import { getListTestCaseResults } from '../../../rest/testAPI';
import { axisTickFormatter } from '../../../utils/ChartUtils';
import {
  formatDateTime,
  getCurrentMillis,
  getEpochMillisForPastDays,
} from '../../../utils/date-time/DateTimeUtils';
import { showErrorToast } from '../../../utils/ToastUtils';
import { useActivityFeedProvider } from '../../ActivityFeed/ActivityFeedProvider/ActivityFeedProvider';
import ErrorPlaceHolder from '../../common/ErrorWithPlaceholder/ErrorPlaceHolder';
import RichTextEditorPreviewer from '../../common/RichTextEditor/RichTextEditorPreviewer';
import DatePickerMenu from '../../DatePickerMenu/DatePickerMenu.component';
import Loader from '../../Loader/Loader';
import SchemaEditor from '../../SchemaEditor/SchemaEditor';
import { TestSummaryProps } from '../profilerDashboard.interface';
import './test-summary.less';
import TestSummaryCustomTooltip from './TestSummaryCustomTooltip.component';

type ChartDataType = {
  information: { label: string; color: string }[];
  data: Record<string, string | number | undefined | Thread>[];
};

const TestSummary: React.FC<TestSummaryProps> = ({
  data,
  showOnlyGraph = false,
}) => {
  const { entityThread = [] } = useActivityFeedProvider();

  const defaultRange = useMemo(
    () => ({
      initialRange: {
        startTs: getEpochMillisForPastDays(
          PROFILER_FILTER_RANGE.last30days.days
        ),
        endTs: getCurrentMillis(),
      },
      key: 'last30days',
      title: PROFILER_FILTER_RANGE.last30days.title,
    }),
    []
  );
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [dateRangeObject, setDateRangeObject] = useState<DateRangeObject>(
    defaultRange.initialRange
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isGraphLoading, setIsGraphLoading] = useState(true);
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>(
    defaultRange.title
  );

  const handleDateRangeChange = (value: DateRangeObject) => {
    if (!isEqual(value, dateRangeObject)) {
      setDateRangeObject(value);
    }
  };

  const chartData = useMemo(() => {
    const chartData: ChartDataType['data'] = [];

    results.forEach((result) => {
      const values = result.testResultValue?.reduce((acc, curr) => {
        const value = round(parseFloat(curr.value ?? ''), 2) || 0;

        return {
          ...acc,
          [curr.name ?? 'value']: value,
        };
      }, {});
      const metric = {
        passedRows: result.passedRows,
        failedRows: result.failedRows,
        passedRowsPercentage: isUndefined(result.passedRowsPercentage)
          ? undefined
          : `${round(result.passedRowsPercentage, 2)}%`,
        failedRowsPercentage: isUndefined(result.failedRowsPercentage)
          ? undefined
          : `${round(result.failedRowsPercentage, 2)}%`,
      };

      chartData.push({
        name: result.timestamp,
        status: result.testCaseStatus,
        ...values,
        ...omitBy(metric, isUndefined),
        incidentId: result.incidentId,
        task: entityThread.find(
          (task) => task.task?.testCaseResolutionStatusId === result.incidentId
        ),
      });
    });
    chartData.reverse();

    return {
      information:
        results[0]?.testResultValue?.map((info, i) => ({
          label: info.name ?? '',
          color: COLORS[i],
        })) ?? [],
      data: chartData,
    };
  }, [results, entityThread]);

  const incidentData = useMemo(() => {
    const data = chartData.data ?? [];

    const issueData = entityThread.map((task) => {
      const failedRows = data.filter(
        (chart) => task.task?.testCaseResolutionStatusId === chart.incidentId
      );
      const x2 =
        task.task?.status === ThreadTaskStatus.Closed
          ? task.task?.closedAt
          : undefined;

      return {
        x1: first(failedRows)?.name,
        x2,
        task,
      };
    });

    return issueData as {
      x1?: string | number;
      x2?: string | number;
      task: Thread;
    }[];
  }, [entityThread, chartData]);

  const customLegendPayLoad = useMemo(() => {
    const legendPayload: Payload[] = chartData?.information.map((info) => ({
      value: info.label,
      type: 'line',
      color: info.color,
    }));

    legendPayload.push({
      value: 'Incident',
      type: 'rect',
      color: RED_3,
    });

    return legendPayload;
  }, [chartData]);

  const updatedDot: LineProps['dot'] = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: any
  ): ReactElement<SVGElement> => {
    const { cx = 0, cy = 0, payload } = props;
    let fill = payload.status === TestCaseStatus.Success ? GREEN_3 : undefined;

    if (isUndefined(fill)) {
      fill = payload.status === TestCaseStatus.Failed ? RED_3 : YELLOW_2;
    }

    return (
      <svg
        fill="none"
        height={8}
        width={8}
        x={cx - 4}
        xmlns="http://www.w3.org/2000/svg"
        y={cy - 4}>
        <circle cx={4} cy={4} fill={fill} r={4} />
      </svg>
    );
  };

  const fetchTestResults = async (dateRangeObj: DateRangeObject) => {
    if (isEmpty(data)) {
      return;
    }
    setIsGraphLoading(true);
    try {
      const { data: chartData } = await getListTestCaseResults(
        data.fullyQualifiedName ?? '',
        pick(dateRangeObj, ['startTs', 'endTs'])
      );

      setResults(chartData);
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setIsLoading(false);
      setIsGraphLoading(false);
    }
  };

  const referenceArea = () => {
    const params = data.parameterValues ?? [];

    if (params.length && params.length < 2) {
      return (
        <ReferenceLine
          label={params[0].name}
          stroke={GREEN_3}
          strokeDasharray="4"
        />
      );
    }
    const yValues = params.reduce((acc, curr, i) => {
      return { ...acc, [`y${i + 1}`]: parseInt(curr.value || '') };
    }, {});

    return (
      <ReferenceArea
        fill={GREEN_3_OPACITY}
        ifOverflow="extendDomain"
        stroke={GREEN_3}
        strokeDasharray="4"
        {...yValues}
      />
    );
  };

  const getGraph = useMemo(() => {
    if (isGraphLoading) {
      return <Loader />;
    }

    return results.length ? (
      <ResponsiveContainer
        className="bg-white"
        id={`${data.name}_graph`}
        minHeight={400}>
        <LineChart
          data={chartData.data}
          margin={{
            top: 16,
            bottom: 16,
            right: 40,
          }}>
          <CartesianGrid stroke={GRAPH_BACKGROUND_COLOR} />
          <XAxis
            dataKey="name"
            domain={['auto', 'auto']}
            padding={{ left: 8, right: 8 }}
            scale="time"
            tickFormatter={formatDateTime}
            type="number"
          />
          <YAxis
            allowDataOverflow
            padding={{ top: 8, bottom: 8 }}
            tickFormatter={(value) => axisTickFormatter(value)}
          />
          <Tooltip
            content={<TestSummaryCustomTooltip />}
            offset={-200}
            wrapperStyle={{ pointerEvents: 'auto' }}
          />
          {referenceArea()}
          <Legend payload={customLegendPayLoad} />
          {chartData?.information?.map((info) => (
            <Line
              dataKey={info.label}
              dot={updatedDot}
              key={uniqueId(info.label)}
              stroke={info.color}
              type="monotone"
            />
          ))}

          {incidentData.length > 0 &&
            incidentData.map((data) => (
              <ReferenceArea
                fill={RED_3_OPACITY}
                ifOverflow="extendDomain"
                key={data.task.id}
                x1={data.x1}
                x2={data.x2}
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    ) : (
      <ErrorPlaceHolder
        className="m-t-0"
        icon={
          <FilterPlaceHolderIcon
            className="w-24"
            data-testid="no-search-image"
          />
        }
        type={ERROR_PLACEHOLDER_TYPE.CUSTOM}>
        <Typography.Paragraph style={{ marginBottom: '0' }}>
          {t('message.no-test-result-for-days', {
            days: selectedTimeRange,
          })}
        </Typography.Paragraph>
        <Typography.Paragraph>
          {t('message.try-extending-time-frame')}
        </Typography.Paragraph>
      </ErrorPlaceHolder>
    );
  }, [isGraphLoading, selectedTimeRange, incidentData, chartData]);

  useEffect(() => {
    if (dateRangeObject) {
      fetchTestResults(dateRangeObject);
    }
  }, [dateRangeObject]);

  const parameterValuesWithSqlExpression = useMemo(
    () =>
      data.parameterValues && data.parameterValues.length > 0
        ? data.parameterValues.filter((param) => param.name === 'sqlExpression')
        : undefined,
    [data.parameterValues]
  );

  const parameterValuesWithoutSqlExpression = useMemo(
    () =>
      data.parameterValues && data.parameterValues.length > 0
        ? data.parameterValues.filter((param) => param.name !== 'sqlExpression')
        : undefined,
    [data.parameterValues]
  );

  const showParamsData = (param: TestCaseParameterValue) => {
    const isSqlQuery = param.name === 'sqlExpression';

    if (isSqlQuery) {
      return (
        <Row
          className="sql-expression-container"
          gutter={[8, 8]}
          key={param.name}>
          <Col span={24}>
            <Typography.Text className="text-grey-muted">
              {`${param.name}:`}
            </Typography.Text>
          </Col>
          <Col span={24}>
            <SchemaEditor
              editorClass="table-query-editor"
              mode={{ name: CSMode.SQL }}
              options={{
                styleActiveLine: false,
              }}
              value={param.value ?? ''}
            />
          </Col>
        </Row>
      );
    } else {
      return (
        <Col data-testid="parameter-value" key={param.name} span={24}>
          <Typography.Text className="text-grey-muted">
            {`${param.name}:`}{' '}
          </Typography.Text>
          <Typography.Text>{param.value}</Typography.Text>
        </Col>
      );
    }
  };

  const showParameters = useMemo(
    () =>
      !isUndefined(parameterValuesWithoutSqlExpression) &&
      !isEmpty(parameterValuesWithoutSqlExpression),
    [parameterValuesWithSqlExpression, parameterValuesWithoutSqlExpression]
  );

  const handleSelectedTimeRange = useCallback((range: string) => {
    setSelectedTimeRange(range);
  }, []);

  return (
    <Row data-testid="test-summary-container" gutter={[0, 16]}>
      <Col span={24}>
        {isLoading ? (
          <Loader />
        ) : (
          <Row gutter={[16, 16]}>
            <Col className="d-flex justify-end" span={24}>
              <DatePickerMenu
                showSelectedCustomRange
                defaultDateRange={pick(defaultRange, ['key', 'title'])}
                handleDateRangeChange={handleDateRangeChange}
                handleSelectedTimeRange={handleSelectedTimeRange}
              />
            </Col>
            <Col data-testid="graph-container" span={24}>
              {getGraph}
            </Col>
          </Row>
        )}
      </Col>
      {showOnlyGraph ? null : (
        <Col span={24}>
          <Row align="top" data-testid="params-container" gutter={[16, 16]}>
            {showParameters && (
              <Col>
                <Typography.Text className="text-grey-muted">
                  {`${t('label.parameter')}:`}
                </Typography.Text>
                {!isEmpty(parameterValuesWithoutSqlExpression) ? (
                  <Row className="parameter-value-container" gutter={[4, 4]}>
                    {parameterValuesWithoutSqlExpression?.map(showParamsData)}
                  </Row>
                ) : (
                  <Typography.Text className="m-l-xs" type="secondary">
                    {t('label.no-parameter-available')}
                  </Typography.Text>
                )}
              </Col>
            )}
            {!isUndefined(parameterValuesWithSqlExpression) ? (
              <Col>{parameterValuesWithSqlExpression.map(showParamsData)}</Col>
            ) : null}
            {data.description && (
              <Col>
                <Space direction="vertical" size={4}>
                  <Typography.Text className="text-grey-muted">
                    {`${t('label.description')}:`}
                  </Typography.Text>
                  <RichTextEditorPreviewer markdown={data.description} />
                </Space>
              </Col>
            )}
          </Row>
        </Col>
      )}
    </Row>
  );
};

export default TestSummary;
