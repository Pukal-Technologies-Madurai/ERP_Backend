import sql from 'mssql';
import { isEqualNumber, isValidNumber, stringCompare } from '../helper_functions.mjs';

export const insertSingleBatch = async (
    transaction,
    batch,
    trans_date = new Date(),
    item_id,
    godown_id,
    quantity = 0,
    rate = 0,
    type,
    reference_id,
    created_by
) => {
    try {
        if (!transaction) {
            return false;
        }

        if (
            stringCompare(batch, '') ||
            !isValidNumber(item_id) ||
            !isValidNumber(godown_id) ||
            isEqualNumber(quantity, 0)
        ) {
            return true;
        }

        const request = new sql.Request(transaction)
            .input('batch', sql.NVarChar(255), batch)
            .input('trans_date', sql.Date, trans_date)
            .input('item_id', sql.Int, item_id)
            .input('godown_id', sql.Int, godown_id)
            .input('quantity', sql.Decimal(18, 2), quantity)
            .input('rate', sql.Decimal(18, 2), rate)
            .input('type', sql.NVarChar(30), type)
            .input('reference_id', sql.Int, reference_id)
            .input('created_by', sql.Int, created_by)
            .query(`
                DECLARE @maxObId INT = (SELECT TOP (1) OB_Id FROM tbl_OB_ST_Date ORDER BY OB_Date DESC);
                DECLARE @batch_id NVARCHAR(100) = (
                    SELECT TOP (1) id 
                    FROM tbl_Batch_Master
                    WHERE 
                        batch = @batch
                        AND item_id = @item_id
                        AND godown_id = @godown_id
                        AND ob_id = @maxObId
                )
                IF @batch_id IS NULL 
                BEGIN
                    INSERT INTO tbl_Batch_Master (
                        batch, trans_date, item_id, godown_id, quantity, 
                        rate, created_at, created_by, ob_id
                    ) VALUES (
                        @batch, @trans_date, @item_id, @godown_id, @quantity, 
                        @rate, GETDATE(), @created_by, @maxObId
                    )
                END
                ELSE
                BEGIN
                    UPDATE tbl_Batch_Master 
                    SET quantity = quantity + @quantity
                    WHERE id = @batch_id
                END
            `);

        const result = await request;

        if (result.rowsAffected.length > 0) {
            return true;
        } else {
            throw new Error('batch creation failed');
        }
    } catch (e) {
        console.error(e);
        return false;
    }
}

export const insertMultipleBatch = async (
    transaction,
    batchArray
) => {
    try {

        if (batchArray.length === 0) {
            return true;
        }

        const batchPromises = batchArray.map(async (batch) => {
            return await insertSingleBatch(
                transaction,
                batch.batch,
                batch.trans_date,
                batch.item_id,
                batch.godown_id,
                batch.quantity,
                batch.rate,
                batch.type,
                batch.reference_id,
                batch.created_by
            );
        });

        const result = await Promise.all(batchPromises);

        if (result.some((value) => !value)) {
            return false;
        }

        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export const reverseBatch = async (
    transaction,
    pre_batch,
    pre_item_id,
    pre_godown_id,
    pre_quantity = 0,
    pre_type = '',
    pre_reference_id,
    created_by,
) => {

    if (!transaction) {
        return false;
    }

    if (
        stringCompare(pre_batch, '') ||
        !isValidNumber(pre_item_id) ||
        !isValidNumber(pre_godown_id) ||
        isEqualNumber(pre_quantity, 0)
    ) {
        return true;
    }

    try {
        const request = new sql.Request(transaction)
            .input('pre_batch', sql.NVarChar(255), pre_batch)
            .input('trans_date', sql.Date, new Date())
            .input('pre_item_id', sql.Int, pre_item_id)
            .input('pre_godown_id', sql.Int, pre_godown_id)
            .input('pre_quantity', sql.Decimal(18, 2), pre_quantity)
            .input('pre_type', sql.NVarChar(30), pre_type)
            .input('pre_reference_id', sql.Int, pre_reference_id)
            .input('created_by', sql.Int, created_by)
            .query(`
                DECLARE @pre_ob_id INT = (
                    SELECT TOP (1) ob_id 
                    FROM tbl_Batch_Master
                    WHERE 
                        batch = @pre_batch
                        AND item_id = @pre_item_id
                        AND godown_id = @pre_godown_id
                    ORDER BY ob_id DESC
                );
                DECLARE @pre_batch_id NVARCHAR(100) = (
                    SELECT TOP (1) id 
                    FROM tbl_Batch_Master
                    WHERE 
                        batch = @pre_batch
                        AND item_id = @pre_item_id
                        AND godown_id = @pre_godown_id
                        AND ob_id = @pre_ob_id
                    ORDER BY ob_id DESC
                );
                IF @pre_batch_id IS NOT NULL 
                BEGIN
                    INSERT INTO tbl_Batch_Transaction (
                        batch_id, batch, trans_date, item_id, godown_id, quantity, 
                        type, reference_id, created_at, created_by, ob_id
                    ) VALUES (
                        @pre_batch_id, @pre_batch, @trans_date, @pre_item_id, @pre_godown_id, -@pre_quantity, 
                        @pre_type + '_REVERSAL', @pre_reference_id, GETDATE(), @created_by, @pre_ob_id
                    )
                END
            `);

        const result = await request;

        if (result.rowsAffected.length > 0) {
            return true;
        } else {
            throw new Error('batch creation failed');
        }

    } catch (e) {
        console.error(e);
        return false;
    }
}

export const reverseMultipleBatch = async (transaction, batchArray) => {
    try {

        if (batchArray.length === 0) {
            return true;
        }

        const updatePromises = batchArray.map(async (batch) => {
            return await reverseBatch(
                transaction,
                batch.pre_batch,
                batch.pre_item_id,
                batch.pre_godown_id,
                batch.pre_quantity,
                batch.pre_type,
                batch.pre_reference_id,
                batch.created_by
            );
        });

        const result = await Promise.all(updatePromises);

        if (result.some((value) => !value)) {
            return false;
        }

        return true;
    } catch (error) {
        console.error(error)
        return false;
    }
}

export const insertBatchUsageDetails = async (
    transaction,
    batch,
    trans_date = new Date(),
    item_id,
    godown_id,
    quantity = 0,
    type,
    reference_id,
    created_by
) => {
    try {

        if (!transaction) {
            return false;
        }

        if (
            stringCompare(batch, '') ||
            !isValidNumber(item_id) ||
            !isValidNumber(godown_id) ||
            isEqualNumber(quantity, 0)
        ) {
            return true;
        }

        const request = new sql.Request(transaction)
            .input('batch', sql.NVarChar(255), batch)
            .input('trans_date', sql.Date, trans_date)
            .input('item_id', sql.Int, item_id)
            .input('godown_id', sql.Int, godown_id)
            .input('quantity', sql.Decimal(18, 2), quantity)
            .input('type', sql.NVarChar(30), type)
            .input('reference_id', sql.Int, reference_id)
            .input('created_by', sql.Int, created_by)
            .query(`
                DECLARE @ob_id INT = (
                    SELECT TOP (1) ob_id 
                    FROM tbl_Batch_Master
                    WHERE 
                        batch = @batch
                        AND item_id = @item_id
                        AND godown_id = @godown_id
                    ORDER BY ob_id DESC
                );
                DECLARE @batch_id NVARCHAR(100) = (
                    SELECT TOP (1) id 
                    FROM tbl_Batch_Master
                    WHERE 
                        batch = @batch
                        AND item_id = @item_id
                        AND godown_id = @godown_id
                        AND ob_id = @ob_id
                    ORDER BY ob_id DESC
                );
                IF @batch_id IS NOT NULL
                BEGIN
                    INSERT INTO tbl_Batch_Transaction (
                        batch_id, batch, trans_date, item_id, godown_id, quantity, 
                        type, reference_id, created_at, created_by, ob_id
                    ) VALUES (
                        @batch_id, @batch, @trans_date, @item_id, @godown_id, @quantity, 
                        @type, @reference_id, GETDATE(), @created_by, @ob_id
                    )
                END
            `);

        const result = await request;

        if (result.rowsAffected.length > 0) {
            return true;
        } else {
            throw new Error('batch creation failed');
        }
    } catch (e) {
        console.error(e);
        return false;
    }
}

export const insertMultipleBatchUsageDetails = async (
    transaction,
    batchArray
) => {
    try {

        if (batchArray.length === 0) {
            return true;
        }

        const batchPromises = batchArray.map(async (batch) => {
            return await insertBatchUsageDetails(
                transaction,
                batch.batch,
                batch.trans_date,
                batch.item_id,
                batch.godown_id,
                batch.quantity,
                batch.type,
                batch.reference_id,
                batch.created_by
            );
        });

        const result = await Promise.all(batchPromises);

        if (result.some((value) => !value)) {
            return false;
        }

        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}