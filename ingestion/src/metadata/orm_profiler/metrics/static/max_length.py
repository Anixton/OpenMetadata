#  Copyright 2021 Collate
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  http://www.apache.org/licenses/LICENSE-2.0
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

"""
MAX_LENGTH Metric definition
"""
# pylint: disable=duplicate-code

from typing import cast

from sqlalchemy import column, func

from metadata.orm_profiler.metrics.core import StaticMetric, _label
from metadata.orm_profiler.orm.functions.length import LenFn
from metadata.orm_profiler.orm.registry import is_concatenable
from metadata.utils.logger import profiler_logger

logger = profiler_logger()


class MaxLength(StaticMetric):
    """
    MAX_LENGTH Metric

    Given a column, return the MIN LENGTH value.

    Only works for concatenable types
    """

    @classmethod
    def name(cls):
        return "maxLength"

    @property
    def metric_type(self):
        return int

    def _is_concatenable(self):
        return is_concatenable(self.col.type)

    @_label
    def fn(self):
        """sqlalchemy function"""
        if self._is_concatenable():
            return func.max(LenFn(column(self.col.name)))

        logger.debug(
            f"Don't know how to process type {self.col.type} when computing MAX_LENGTH"
        )
        return None

    # pylint: disable=import-outside-toplevel
    @_label
    def df_fn(self, df=None):
        """dataframe function"""
        import pandas as pd
        from numpy import vectorize

        df = cast(pd.DataFrame, df)  # satisfy mypy

        if self._is_concatenable():
            length_vector_fn = vectorize(len)
            return length_vector_fn(
                df[self.col.name][~df[self.col.name].isnull()]
            ).max()
        logger.debug(
            f"Don't know how to process type {self.col.type} when computing MAX_LENGTH"
        )
        return 0
