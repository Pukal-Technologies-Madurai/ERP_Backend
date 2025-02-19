/**
 * @param {number} amount 
 * @param {number} gstRate 
 * @param {string} type 3 Types add, remove, zerotax
 * @returns {object} 
 */

import { toNumber } from "../helper_functions.mjs";

export const calculateGSTDetails = (amount, gstRate, type = 'add') => {

    const validatedAmount = toNumber(amount);
    const validatedGstRate = toNumber(gstRate);

    const halfGstRate = validatedGstRate / 2;
    let baseAmount, taxAmount, withTax, withoutTax;

    if (type === 'zerotax') {
        baseAmount = validatedAmount; // No tax applied
        taxAmount = 0;
        withTax = validatedAmount;
        withoutTax = validatedAmount;
    } else if (type === 'add') {
        taxAmount = (validatedAmount * validatedGstRate) / 100;
        baseAmount = validatedAmount;
        withTax = validatedAmount + taxAmount;
        withoutTax = validatedAmount;
    } else if (type === 'remove') {
        baseAmount = validatedAmount / (1 + validatedGstRate / 100);
        taxAmount = validatedAmount - baseAmount;
        withTax = validatedAmount;
        withoutTax = baseAmount;
    } else {
        throw new Error("Invalid type. Use 'add', 'remove', or 'zerotax'.");
    }

    const sgstAmount = (taxAmount / 2).toFixed(2);
    const cgstAmount = (taxAmount / 2).toFixed(2);
    const igstAmount = taxAmount.toFixed(2);

    return {
        base_amount: Number(baseAmount).toFixed(2),
        with_tax: Number(withTax).toFixed(2),
        without_tax: Number(withoutTax).toFixed(2),
        tax_per: Number(validatedGstRate),
        tax_amount: Number(taxAmount).toFixed(2),
        sgst_per: Number(halfGstRate),
        sgst_amount: Number(sgstAmount),
        cgst_per: Number(halfGstRate),
        cgst_amount: Number(cgstAmount),
        igst_per: Number(validatedGstRate),
        igst_amount: Number(igstAmount),
        type,
    };
};