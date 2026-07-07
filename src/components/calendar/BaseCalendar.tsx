import { useMemo, useState } from 'react';
import { Box, Button, IconButton, Menu, MenuItem, Stack, Typography } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import type { Theme } from '@mui/material/styles';
import { motion, reducedMotionSx, transition } from '../../styles/motion';

export type CalendarViewMode = 'month' | 'week';

export interface CalendarDayRenderMeta {
  disabled?: boolean;
  selected?: boolean;
  inMonth?: boolean;
  hasDot?: boolean;
  eventCount?: number;
  dotColors?: string[];
  warning?: boolean;
  titles?: string[];
}

interface BaseCalendarProps {
  isZh: boolean;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  mode: CalendarViewMode;
  monthFormat?: Intl.DateTimeFormatOptions;
  toggle?: {
    expanded: boolean;
    onToggle: () => void;
    expandedLabel: string;
    collapsedLabel: string;
    expandedAria: string;
    collapsedAria: string;
  };
  getDayMeta?: (date: Date, inMonth: boolean) => CalendarDayRenderMeta;
  dayCellMinHeight?: number;
  dayContentMinHeight?: number;
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  return start;
}

function getWeekDays(date: Date) {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function getCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + index);
    return day;
  });
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function isSameDate(left: Date, right: Date) {
  return toDateKey(left) === toDateKey(right);
}

const calendarControlBaseSx = {
  borderRadius: 999,
  border: '1px solid',
  borderColor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(226,232,240,0.10)',
  bgcolor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.56)' : 'rgba(18,20,28,0.54)',
  color: 'text.secondary',
  boxShadow: 'none',
  transition: transition(['background-color', 'border-color', 'box-shadow', 'color', 'transform'], motion.durations.base, motion.softOut),
  '&:hover': {
    bgcolor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(255,255,255,0.86)' : 'rgba(28,31,42,0.76)',
    borderColor: (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(49,90,156,0.24)' : 'rgba(120,156,220,0.26)',
    color: 'primary.main',
    boxShadow: (theme: Theme) => theme.palette.mode === 'light'
      ? '0 8px 22px rgba(15,23,42,0.08)'
      : '0 10px 26px rgba(0,0,0,0.24)',
  },
  '&:active': {
    transform: 'scale(0.985)',
    transitionTimingFunction: motion.press,
    transitionDuration: `${motion.durations.instant}ms`,
  },
  '&.Mui-focusVisible': {
    borderColor: 'primary.main',
    boxShadow: (theme: Theme) => theme.palette.mode === 'light'
      ? '0 0 0 3px rgba(49,90,156,0.14)'
      : '0 0 0 3px rgba(120,156,220,0.18)',
  },
  ...reducedMotionSx,
};

const calendarIconButtonSx = {
  ...calendarControlBaseSx,
  width: 32,
  height: 32,
};

function buildCalendarDayButtonSx({
  inMonth,
  selected,
  warning,
  today,
  minHeight,
}: {
  inMonth: boolean;
  selected: boolean;
  warning: boolean;
  today: boolean;
  minHeight: number;
}) {
  return {
    minWidth: 0,
    minHeight,
    p: 0.4,
    borderRadius: 1,
    display: 'grid',
    placeItems: 'center',
    color: inMonth ? (selected ? 'primary.main' : 'text.primary') : 'text.disabled',
    bgcolor: selected ? (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(59,130,246,0.08)' : 'rgba(96,165,250,0.14)' : 'transparent',
    border: '1px solid',
    borderColor: selected ? 'primary.main' : warning ? 'warning.main' : today ? 'primary.main' : 'transparent',
    opacity: inMonth ? 1 : 0.42,
    boxShadow: today && !selected ? '0 0 0 1px rgba(59,130,246,0.08) inset' : 'none',
    transition: transition(['background-color', 'border-color', 'box-shadow', 'color', 'opacity', 'transform'], motion.durations.base, motion.softOut),
    '&:hover': {
      bgcolor: selected ? (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(59,130,246,0.12)' : 'rgba(96,165,250,0.18)' : (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.045)' : 'rgba(226,232,240,0.08)',
      borderColor: selected ? 'primary.main' : warning ? 'warning.main' : today ? 'primary.main' : (theme: Theme) => theme.palette.mode === 'light' ? 'rgba(15,23,42,0.10)' : 'rgba(226,232,240,0.12)',
      boxShadow: selected
        ? '0 0 0 1px rgba(59,130,246,0.08) inset'
        : (theme: Theme) => theme.palette.mode === 'light' ? '0 8px 18px rgba(15,23,42,0.06)' : '0 10px 24px rgba(0,0,0,0.18)',
      transform: 'translateY(-1px)',
    },
    '&:active': {
      transform: 'scale(0.985)',
      transitionTimingFunction: motion.press,
      transitionDuration: `${motion.durations.instant}ms`,
    },
    '&.Mui-focusVisible': {
      borderColor: 'primary.main',
      boxShadow: (theme: Theme) => theme.palette.mode === 'light'
        ? '0 0 0 3px rgba(49,90,156,0.12)'
        : '0 0 0 3px rgba(120,156,220,0.16)',
    },
    '&.Mui-disabled': { opacity: inMonth ? 0.58 : 0.22 },
    ...reducedMotionSx,
  };
}

export default function BaseCalendar({
  isZh,
  selectedDate,
  onSelectDate,
  mode,
  monthFormat,
  toggle,
  getDayMeta,
  dayCellMinHeight,
  dayContentMinHeight,
}: BaseCalendarProps) {
  const selectedDateKey = toDateKey(selectedDate);
  const selectedMonth = useMemo(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1), [selectedDate]);
  const [visibleMonthState, setVisibleMonthState] = useState(() => ({
    selectedDateKey,
    month: selectedMonth,
  }));
  const [yearMenuAnchor, setYearMenuAnchor] = useState<null | HTMLElement>(null);
  const [monthMenuAnchor, setMonthMenuAnchor] = useState<null | HTMLElement>(null);
  const visibleMonth = visibleMonthState.selectedDateKey === selectedDateKey ? visibleMonthState.month : selectedMonth;
  const setVisibleMonth = (updater: Date | ((previous: Date) => Date)) => {
    setVisibleMonthState((previous) => ({
      selectedDateKey,
      month: typeof updater === 'function' ? updater(previous.selectedDateKey === selectedDateKey ? previous.month : selectedMonth) : updater,
    }));
  };
  const monthKey = toMonthKey(visibleMonth);
  const yearLabel = `${visibleMonth.getFullYear()}${isZh ? '年' : ''}`;
  const monthLabel = visibleMonth.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', monthFormat || { month: 'long' });
  const weekdays = isZh ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = useMemo(() => new Date(), []);
  const yearOptions = useMemo(
    () => Array.from({ length: 121 }, (_, i) => visibleMonth.getFullYear() - 60 + i),
    [visibleMonth],
  );
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, month) => ({
      month,
      label: new Date(2026, month, 1).toLocaleDateString(isZh ? 'zh-CN' : 'en-US', monthFormat || { month: 'long' }),
    })),
    [isZh, monthFormat],
  );

  const anchor = toMonthKey(selectedDate) === monthKey ? selectedDate : visibleMonth;
  const calendarDays = useMemo(() => mode === 'month' ? getCalendarDays(visibleMonth) : getWeekDays(anchor), [mode, visibleMonth, anchor]);

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 36px auto auto', alignItems: 'center', gap: 0.5 }}>
        <IconButton
          size="small"
          onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
          aria-label={isZh ? '上个月' : 'Previous month'}
          sx={calendarIconButtonSx}
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, minWidth: 0 }}>
          <CalendarMonthIcon fontSize="small" color="primary" />
          <Button
            size="small"
            disableRipple
            onClick={(event) => setYearMenuAnchor(event.currentTarget)}
            sx={{ ...calendarControlBaseSx, minWidth: 0, minHeight: 30, px: 0.9, fontWeight: 750, textTransform: 'none', color: 'text.primary' }}
          >
            {yearLabel}
          </Button>
          <Button
            size="small"
            disableRipple
            onClick={(event) => setMonthMenuAnchor(event.currentTarget)}
            sx={{ ...calendarControlBaseSx, minWidth: 0, minHeight: 30, px: 0.9, fontWeight: 750, textTransform: 'none', color: 'text.primary' }}
          >
            {monthLabel}
          </Button>
        </Box>
        <IconButton
          size="small"
          onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
          aria-label={isZh ? '下个月' : 'Next month'}
          sx={calendarIconButtonSx}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        {toggle ? (
          <Button
            size="small"
            disableRipple
            onClick={toggle.onToggle}
            aria-label={toggle.expanded ? toggle.expandedAria : toggle.collapsedAria}
            endIcon={toggle.expanded ? <UnfoldLessIcon fontSize="small" /> : <UnfoldMoreIcon fontSize="small" />}
            sx={{ ...calendarControlBaseSx, minHeight: 30, px: 1.2, whiteSpace: 'nowrap' }}
          >
            {toggle.expanded ? toggle.expandedLabel : toggle.collapsedLabel}
          </Button>
        ) : <Box />}
        <Button
          size="small"
          disableRipple
          onClick={() => {
            setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            onSelectDate(today);
          }}
          sx={{
            ...calendarControlBaseSx,
            minHeight: 30,
            px: 1.15,
            whiteSpace: 'nowrap',
            color: isSameDate(selectedDate, today) ? 'primary.main' : 'text.secondary',
          }}
        >
          {isZh ? '今天' : 'Today'}
        </Button>
      </Box>
      <Menu
        anchorEl={yearMenuAnchor}
        open={Boolean(yearMenuAnchor)}
        onClose={() => setYearMenuAnchor(null)}
        slotProps={{
          paper: {
            sx: { maxHeight: 300, width: 120 },
          },
        }}
      >
        {yearOptions.map((year) => (
          <MenuItem
            key={year}
            selected={year === visibleMonth.getFullYear()}
            onClick={() => {
              setVisibleMonth((prev) => new Date(year, prev.getMonth(), 1));
              setYearMenuAnchor(null);
            }}
          >
            {isZh ? `${year}年` : year}
          </MenuItem>
        ))}
      </Menu>
      <Menu
        anchorEl={monthMenuAnchor}
        open={Boolean(monthMenuAnchor)}
        onClose={() => setMonthMenuAnchor(null)}
        slotProps={{
          paper: {
            sx: { maxHeight: 320, width: 132 },
          },
        }}
      >
        {monthOptions.map((option) => (
          <MenuItem
            key={option.month}
            selected={option.month === visibleMonth.getMonth()}
            onClick={() => {
              setVisibleMonth((prev) => new Date(prev.getFullYear(), option.month, 1));
              setMonthMenuAnchor(null);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {weekdays.map((weekday, index) => <Typography key={`${weekday}-${index}`} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 700 }}>{weekday}</Typography>)}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {calendarDays.map((day) => {
          const inMonth = toMonthKey(day) === monthKey;
          const meta = getDayMeta?.(day, inMonth) || {};
          const selected = meta.selected ?? (toDateKey(day) === toDateKey(selectedDate));
          const disabled = meta.disabled ?? false;
          const visibleTitles = meta.titles?.slice(0, 2) || [];
          const eventCount = Math.max(0, Math.min(3, Math.floor(meta.eventCount ?? meta.titles?.length ?? (meta.hasDot ? 1 : 0))));
          const hiddenTitleCount = Math.max(0, (meta.eventCount ?? meta.titles?.length ?? 0) - visibleTitles.length);
          const dayIsToday = isSameDate(day, today);
          const dotColors = meta.dotColors?.length ? meta.dotColors : ['primary.main'];
          const hasSupplement = visibleTitles.length > 0 || eventCount > 0;
          return (
            <Button
              key={toDateKey(day)}
              size="small"
              disableRipple
              disabled={disabled}
              onClick={() => onSelectDate(day)}
              sx={buildCalendarDayButtonSx({
                inMonth,
                selected,
                warning: Boolean(meta.warning),
                today: dayIsToday,
                minHeight: dayCellMinHeight ?? (mode === 'month' ? 38 : 34),
              })}
            >
              <Stack
                spacing={0.15}
                sx={{
                  alignItems: 'center',
                  justifyContent: hasSupplement ? 'flex-start' : 'center',
                  width: '100%',
                  minHeight: dayContentMinHeight ?? (mode === 'month' ? 30 : 22),
                }}
              >
                <Typography sx={{ fontSize: 12, lineHeight: 1, fontWeight: selected ? 800 : 600 }}>{day.getDate()}</Typography>
                {visibleTitles.map((title, idx) => (
                  <Typography
                    key={`${title}-${idx}`}
                    sx={{
                      fontSize: 9,
                      lineHeight: 1.1,
                      maxWidth: '100%',
                      px: 0.3,
                      color: selected ? 'primary.main' : 'text.secondary',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {title}
                  </Typography>
                ))}
                {visibleTitles.length && hiddenTitleCount > 0 ? (
                  <Typography sx={{ fontSize: 9, lineHeight: 1, color: meta.warning ? 'warning.main' : 'text.secondary', fontWeight: 700 }}>
                    {`+${hiddenTitleCount}`}
                  </Typography>
                ) : null}
                {!visibleTitles.length && eventCount > 0 ? (
                  <Box
                    aria-hidden
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: eventCount === 1 ? '1fr' : eventCount === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                      gap: 0.3,
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: eventCount === 1 ? 5 : eventCount === 2 ? 12 : 19,
                      mt: 0.15,
                    }}
                  >
                    {Array.from({ length: eventCount }, (_, index) => (
                      <Box
                        key={index}
                        sx={{
                          width: 4.5,
                          height: 4.5,
                          borderRadius: '999px',
                          bgcolor: dotColors[index] || dotColors[dotColors.length - 1] || 'primary.main',
                          opacity: selected ? 0.9 : inMonth ? 0.78 : 0.42,
                        }}
                      />
                    ))}
                  </Box>
                ) : null}
              </Stack>
            </Button>
          );
        })}
      </Box>
    </Box>
  );
}
