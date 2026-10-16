import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import api from '../services/api';
import Coupons from './Coupons';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

const WELCOME10 = {
  id: 7, code: 'WELCOME10', description: 'New customers', discount_type: 'percent', discount_value: '10.00',
  max_discount: '200.00', min_bill_amount: '500.00', start_date: '2026-10-01', end_date: '2026-10-31',
  is_active: true, usage_limit: 100, per_customer_limit: 1, status: 'running', times_used: 3,
};

const SAVE50 = {
  id: 8, code: 'SAVE50', description: null, discount_type: 'amount', discount_value: '50.00',
  max_discount: null, min_bill_amount: '0.00', start_date: '2026-11-01', end_date: '2026-11-30',
  is_active: true, usage_limit: null, per_customer_limit: null, status: 'upcoming', times_used: 0,
};

beforeEach(() => {
  mockApi.get.mockResolvedValue({ data: { items: [WELCOME10, SAVE50] } });
  mockApi.post.mockResolvedValue({ data: {} });
  mockApi.put.mockResolvedValue({ data: {} });
  mockApi.delete.mockResolvedValue({ data: {} });
});

const rowOf = async (code: string) => (await screen.findByText(code)).closest('tr') as HTMLElement;

test('lists coupons with discount, limits, usage and status', async () => {
  render(<Coupons />);
  const welcome = within(await rowOf('WELCOME10'));
  expect(welcome.getByText('New customers')).toBeInTheDocument();
  expect(welcome.getByText('10% off up to ₹200')).toBeInTheDocument();
  expect(welcome.getByText('₹500')).toBeInTheDocument();
  expect(welcome.getByText(/3 \/ 100/)).toBeInTheDocument();
  expect(welcome.getByText('1 per customer')).toBeInTheDocument();
  expect(welcome.getByText('Running')).toBeInTheDocument();

  const save = within(await rowOf('SAVE50'));
  expect(save.getByText('₹50 off the bill')).toBeInTheDocument();
  expect(save.getByText('Upcoming')).toBeInTheDocument();
});

test('filters by status', async () => {
  render(<Coupons />);
  await rowOf('WELCOME10');
  userEvent.click(screen.getByRole('button', { name: 'Ended' }));
  await waitFor(() => expect(mockApi.get).toHaveBeenLastCalledWith('/coupons', { params: { status: 'ended' } }));
});

test('creates a rupee coupon with blank limits sent as null', async () => {
  render(<Coupons />);
  await rowOf('WELCOME10');
  userEvent.click(screen.getByRole('button', { name: 'New coupon' }));

  userEvent.type(screen.getByLabelText(/^Code/), 'save 100');
  expect(screen.getByLabelText(/^Code/)).toHaveValue('SAVE100');
  userEvent.click(screen.getByRole('button', { name: '₹ off the bill' }));
  expect(screen.queryByLabelText(/Maximum discount/)).not.toBeInTheDocument();
  userEvent.clear(screen.getByLabelText('Rupees off'));
  userEvent.type(screen.getByLabelText('Rupees off'), '100');
  userEvent.clear(screen.getByLabelText(/Minimum bill/));
  userEvent.type(screen.getByLabelText(/Minimum bill/), '500');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/coupons', expect.objectContaining({
    code: 'SAVE100', description: null, discount_type: 'amount', discount_value: 100, max_discount: null,
    min_bill_amount: 500, is_active: true, usage_limit: null, per_customer_limit: null,
  })));
  expect(toast.success).toHaveBeenCalledWith('Coupon saved');
});

test('shows the server validation message when saving fails', async () => {
  mockApi.post.mockRejectedValue({
    response: { data: { detail: [{ msg: 'Value error, End date cannot be before start date' }] } },
  });
  render(<Coupons />);
  await rowOf('WELCOME10');
  userEvent.click(screen.getByRole('button', { name: 'New coupon' }));
  userEvent.type(screen.getByLabelText(/^Code/), 'BAD');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('End date cannot be before start date'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('edits a coupon with PUT, keeping its existing values', async () => {
  render(<Coupons />);
  const row = within(await rowOf('WELCOME10'));
  userEvent.click(row.getByTestId('EditIcon').closest('button') as HTMLElement);

  expect(screen.getByLabelText(/^Code/)).toHaveValue('WELCOME10');
  expect(screen.getByLabelText(/Maximum discount/)).toHaveValue(200);
  userEvent.clear(screen.getByLabelText('Percent off'));
  userEvent.type(screen.getByLabelText('Percent off'), '15');
  userEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith('/coupons/7', expect.objectContaining({
    code: 'WELCOME10', discount_type: 'percent', discount_value: 15, max_discount: 200,
    min_bill_amount: 500, usage_limit: 100, per_customer_limit: 1,
    start_date: '2026-10-01', end_date: '2026-10-31',
  })));
});

test('deletes a coupon only after confirmation', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  render(<Coupons />);
  const row = within(await rowOf('SAVE50'));
  const deleteButton = row.getByTestId('DeleteIcon').closest('button') as HTMLElement;

  userEvent.click(deleteButton);
  expect(mockApi.delete).not.toHaveBeenCalled();

  userEvent.click(deleteButton);
  await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith('/coupons/8'));
  expect(confirm).toHaveBeenCalledTimes(2);
  confirm.mockRestore();
});
