import type { Business, Courier } from '@prisma/client';
import type { BusinessDto, CourierDto } from '@ph/shared';

export function toBusinessDto(b: Business): BusinessDto {
  return {
    id: b.id,
    name: b.name,
    phone: b.phone,
    address: b.address,
    city: b.city,
    businessType: b.businessType,
    facebookPageUrl: b.facebookPageUrl,
    currency: b.currency,
    timezone: b.timezone,
    defaultCourierId: b.defaultCourierId,
    defaultCourierCost: b.defaultCourierCost,
    defaultReturnCost: b.defaultReturnCost,
    defaultPackagingCost: b.defaultPackagingCost,
  };
}

export function toCourierDto(c: Courier): CourierDto {
  return { id: c.id, name: c.name, defaultCost: c.defaultCost, defaultReturnCost: c.defaultReturnCost, isActive: c.isActive };
}
