import { z } from "zod";

export const multipleSalesInvoiceStaffUpdateSchema = z.object({
    CostCategory: z.number({ required_error: 'CostCategory is required' }).int(),
    Do_Id: z.array(z.number().int()).min(1, 'At least one Invoice ID is required'),
    involvedStaffs: z.array(z.number().int()),
    deliveryStatus: z.number().int().default(5)
});