import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import api from '../services/api';
import { printReceipt } from '../services/receipt';
import Billing from './Billing';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../services/receipt', () => ({ printReceipt: jest.fn() }));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;
const mockPrint = printReceipt as jest.Mock;

const SUGAR = {
  id: 1, product_no: 'P00001', product_name: 'Sugar 1kg', barcode: '8901234567890', selling_price: '100.00',
  mrp: '120.00', tax_percent: '5', stock_quantity: '10', unit_type: 'pcs', is_loose: false,
  batches: [{ id: 11, mrp: '120.00', selling_price: '100.00', quantity_left: '10', clearance_percent: '0' }],
};

const COUPON_OK = {
  code: 'TEST10', description: 'Ten off', coupon_discount: '10.00', saving: '10.00', notes: [],
  items: [{ index: 0, coupon_amount: '10.00' }],
};

const HELD = {
  id: 3, label: null, customer_name: null, customer_phone: null, coupon_code: 'TEST10', item_count: 1,
  total_amount: '100.00', created_at: '2026-10-16T10:00:00',
  items: [{ product_id: 1, product_name: 'Sugar 1kg', quantity: '1', unit_price: '100.00', mrp: '120.00', tax_percent: '5', unit_type: 'pcs' }],
};

let heldList: any[] = [];

beforeEach(() => {
  heldList = [];
  mockApi.get.mockImplementation(async (url: string) => {
    if (url === '/held-bills') return { data: { items: heldList } };
    if (url === '/held-bills/3') return { data: HELD };
    if (url === '/settings/billing') return { data: { tax_inclusive_pricing: true } };
    if (url === '/settings/store') return { data: { store_state_code: '27' } };
    if (url === '/products/search') return { data: SUGAR };
    throw new Error(`Unexpected GET ${url}`);
  });
  mockApi.post.mockImplementation(async (url: string) => {
    if (url === '/sales/coupon-check') return { data: COUPON_OK };
    if (url === '/sales') return { data: { invoice_no: 'INV-1', invoice_id: 5 } };
    if (url === '/held-bills') return { data: {} };
    throw new Error(`Unexpected POST ${url}`);
  });
  mockPrint.mockResolvedValue(undefined);
});

const grandTotal = () => screen.getByText('Grand Total:').nextElementSibling?.textContent;

const scanSugar = async () => {
  userEvent.type(screen.getByPlaceholderText(/Scan barcode/), '8901234567890{enter}');
  await screen.findByText('Sugar 1kg');
  expect(grandTotal()).toBe('₹100.00');
};

const applyCoupon = (code: string) => {
  userEvent.click(screen.getByRole('button', { name: 'Checkout' }));
  userEvent.type(screen.getByLabelText(/Coupon Code/), code);
  userEvent.click(screen.getByRole('button', { name: 'Apply' }));
};

const completeButton = () => screen.getByRole('button', { name: /Complete & Print/ });

test('applies a valid coupon, shows the saving and sends the code with the sale', async () => {
  render(<Billing />);
  await scanSugar();
  applyCoupon('test10');

  expect(await screen.findByText(/saves ₹10.00 more/, {}, { timeout: 3000 })).toBeInTheDocument();
  expect(mockApi.post).toHaveBeenCalledWith('/sales/coupon-check', {
    code: 'TEST10', items: [expect.objectContaining({ product_id: 1, quantity: 1 })], customer_phone: undefined,
  });
  expect(screen.getByText('Coupon TEST10 −₹10.00')).toBeInTheDocument();
  expect(screen.getByText('incl. coupon TEST10:')).toBeInTheDocument();
  expect(grandTotal()).toBe('₹90.00');
  expect(completeButton()).toBeEnabled();

  userEvent.click(completeButton());
  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sales', expect.objectContaining({
    coupon_code: 'TEST10', items: [expect.objectContaining({ product_id: 1, quantity: 1 })],
  })));
  await waitFor(() => expect(mockPrint).toHaveBeenCalledWith(5));
  expect(toast.success).toHaveBeenCalledWith('Sale completed! Invoice: INV-1');
});

test('blocks the sale on an invalid coupon until it is removed', async () => {
  mockApi.post.mockImplementation(async (url: string) => {
    if (url === '/sales/coupon-check') {
      return Promise.reject({ response: { status: 400, data: { detail: 'Coupon BAD is not valid' } } });
    }
    if (url === '/sales') return { data: { invoice_no: 'INV-2' } };
    throw new Error(`Unexpected POST ${url}`);
  });
  render(<Billing />);
  await scanSugar();
  applyCoupon('BAD');

  expect(await screen.findByText('Coupon BAD is not valid', {}, { timeout: 3000 })).toBeInTheDocument();
  expect(completeButton()).toBeDisabled();
  expect(grandTotal()).toBe('₹100.00');

  userEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(screen.queryByText('Coupon BAD is not valid')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Coupon Code/)).toHaveValue('');
  expect(completeButton()).toBeEnabled();

  userEvent.click(completeButton());
  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sales', expect.objectContaining({ coupon_code: undefined })));
});

test('a held bill keeps its coupon code', async () => {
  const prompt = jest.spyOn(window, 'prompt').mockReturnValue('');
  render(<Billing />);
  await scanSugar();
  applyCoupon('TEST10');
  await screen.findByText(/saves ₹10.00 more/, {}, { timeout: 3000 });
  userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  userEvent.click(screen.getByRole('button', { name: 'Hold Bill' }));
  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/held-bills', expect.objectContaining({
    coupon_code: 'TEST10', items: [expect.objectContaining({ product_id: 1, quantity: 1 })],
  })));
  await waitFor(() => expect(screen.queryByText('Sugar 1kg')).not.toBeInTheDocument());
  prompt.mockRestore();
});

test('recalling a held bill checks its coupon again', async () => {
  heldList = [HELD];
  render(<Billing />);
  userEvent.click(await screen.findByRole('button', { name: 'Held (1)' }));
  userEvent.click(await screen.findByText(/Bill #3/));

  await screen.findByText('Sugar 1kg');
  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sales/coupon-check', expect.objectContaining({
    code: 'TEST10', items: [expect.objectContaining({ product_id: 1, quantity: 1 })],
  })), { timeout: 3000 });
  expect(await screen.findByText('Coupon TEST10 −₹10.00')).toBeInTheDocument();
  expect(grandTotal()).toBe('₹90.00');
});
