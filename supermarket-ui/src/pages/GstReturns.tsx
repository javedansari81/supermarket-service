/**
 * GST Returns Page - GSTR-1 and GSTR-3B for a return period (month or financial-year quarter)
 */
import React, { useState } from 'react';
import { Box, Card, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../components/layout/PageHeader';
import GstReturnsReport from '../components/reports/GstReturns';

type PeriodType = 'month' | 'quarter';
const QUARTERS_LISTED = 8;

// Financial-year quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
const quarterStart = (day: Dayjs) => {
  const m = day.month();
  return day.month(m - ((m + 9) % 3)).startOf('month');
};

const quarterLabel = (start: Dayjs) => {
  const fy = start.month() >= 3 ? start.year() : start.year() - 1;
  const quarter = Math.floor(((start.month() + 9) % 12) / 3) + 1;
  return `Q${quarter} FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')} (${start.format('MMM')}–${start.add(2, 'month').format('MMM YYYY')})`;
};

const quarterOptions = () => {
  const current = quarterStart(dayjs());
  return Array.from({ length: QUARTERS_LISTED }, (_, i) => current.subtract(i * 3, 'month'));
};

const GstReturns: React.FC = () => {
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [month, setMonth] = useState<Dayjs | null>(dayjs().subtract(1, 'month').startOf('month'));
  const [quarter, setQuarter] = useState(quarterStart(dayjs().subtract(3, 'month')).format('YYYY-MM-DD'));

  const start = periodType === 'month' ? month?.startOf('month') : dayjs(quarter);
  const end = start && (periodType === 'month' ? start.endOf('month') : start.add(2, 'month').endOf('month'));
  const valid = !!start && start.isValid();

  return (
    <Box>
      <PageHeader title="GST Returns" />
      <Card sx={{ mb: 3, p: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { xs: 'stretch', sm: 'center' } }}>
          <ToggleButtonGroup size="small" exclusive value={periodType} onChange={(_, v) => v && setPeriodType(v)}>
            <ToggleButton value="month">Monthly</ToggleButton>
            <ToggleButton value="quarter">Quarterly</ToggleButton>
          </ToggleButtonGroup>
          {periodType === 'month' ? (
            <DatePicker label="Return Month" views={['year', 'month']} openTo="month" format="MMM YYYY"
              value={month} onChange={setMonth} sx={{ width: { xs: '100%', sm: 200 } }} />
          ) : (
            <TextField select size="small" label="Return Quarter" value={quarter} onChange={(e) => setQuarter(e.target.value)}
              sx={{ width: { xs: '100%', sm: 320 } }}>
              {quarterOptions().map((q) => <MenuItem key={q.format('YYYY-MM-DD')} value={q.format('YYYY-MM-DD')}>{quarterLabel(q)}</MenuItem>)}
            </TextField>
          )}
          {valid && end && (
            <Typography variant="body2" color="text.secondary">
              {start.format('DD MMM YYYY')} to {end.format('DD MMM YYYY')}
            </Typography>
          )}
        </Box>
      </Card>
      {valid && end && <GstReturnsReport fromDate={start.format('YYYY-MM-DD')} toDate={end.format('YYYY-MM-DD')} />}
    </Box>
  );
};

export default GstReturns;
