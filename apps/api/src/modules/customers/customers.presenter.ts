import type { CustomerProfileDto } from '@ph/shared';
import { fromDbDate } from '../../common/dates';
import type { CustomerStatsRow } from './customers.repository';

export function toCustomerDto(c: CustomerStatsRow): CustomerProfileDto {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    city: c.city,
    note: c.note,
    totalOrders: c.totalOrders,
    deliveredOrders: c.deliveredOrders,
    returnedOrders: c.returnedOrders,
    totalSpent: c.totalSpent,
    lastOrderDate: c.lastOrderDate ? fromDbDate(c.lastOrderDate) : null,
    profitGenerated: c.profitGenerated,
  };
}
