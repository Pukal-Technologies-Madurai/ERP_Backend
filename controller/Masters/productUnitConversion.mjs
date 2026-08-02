import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';

const productUnitConversionController = () => {

    const getConversions = async (req, res) => {
        try {
            const query = `
            WITH MAPPINGS AS (
                SELECT 
                    c.ConversionId,
                    c.ProductId,
                    c.FromUnitId,
                    f.UnitName AS FromUnitName,
                    f.UnitCode AS FromUnitCode,
                    c.ToUnitId,
                    t.UnitName AS ToUnitName,
                    t.UnitCode AS ToUnitCode,
                    c.ConversionFactor,
                    c.IsDefault,
                    c.Remarks
                FROM 
                    tbl_Unit_Master_Product_Conversion c
                LEFT JOIN tbl_Unit_Master_Measurement_Unit f ON c.FromUnitId = f.UnitId
                LEFT JOIN tbl_Unit_Master_Measurement_Unit t ON c.ToUnitId = t.UnitId
            )
            SELECT 
                p.Product_Id,
                p.Product_Name,
                COALESCE((
                    SELECT * FROM MAPPINGS AS m WHERE p.Product_Id = m.ProductId FOR JSON PATH
                ), '[]') AS GroupedConversionsArray
            FROM tbl_Product_Master AS p
            WHERE EXISTS (SELECT 1 FROM tbl_Unit_Master_Product_Conversion c WHERE c.ProductId = p.Product_Id)
            ORDER BY p.Product_Name ASC`;

            const request = new sql.Request();
            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    GroupedConversionsArray: JSON.parse(o?.GroupedConversionsArray)
                }));
                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const postConversion = async (req, res) => {
        const { ProductId, FromUnitId, ToUnitId, ConversionFactor, IsDefault = 0, Remarks } = req.body;

        if (!ProductId || !FromUnitId || !ToUnitId || ConversionFactor === undefined || ConversionFactor === null) {
            return invalidInput(res, 'ProductId, FromUnitId, ToUnitId, and ConversionFactor are required');
        }

        try {
            const request = new sql.Request();
            request.input('ProductId', ProductId);
            request.input('FromUnitId', FromUnitId);
            request.input('ToUnitId', ToUnitId);
            request.input('ConversionFactor', ConversionFactor);
            request.input('IsDefault', IsDefault);
            request.input('Remarks', Remarks || null);

            // If this is set as default, we might optionally want to unset other defaults
            if (IsDefault === 1) {
                const updateRequest = new sql.Request();
                updateRequest.input('ProductId', ProductId);
                await updateRequest.query(`UPDATE tbl_Unit_Master_Product_Conversion SET IsDefault = 0 WHERE ProductId = @ProductId`);
            }

            const query = `
                INSERT INTO tbl_Unit_Master_Product_Conversion 
                (ProductId, FromUnitId, ToUnitId, ConversionFactor, IsDefault, Remarks) 
                VALUES 
                (@ProductId, @FromUnitId, @ToUnitId, @ConversionFactor, @IsDefault, @Remarks)
            `;

            const result = await request.query(query);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Product unit mapping created successfully');
            } else {
                failed(res, 'Failed to create product unit mapping');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const putConversion = async (req, res) => {
        const { ConversionId, ProductId, FromUnitId, ToUnitId, ConversionFactor, IsDefault, Remarks } = req.body;

        if (!ConversionId || !ProductId || !FromUnitId || !ToUnitId || ConversionFactor === undefined || ConversionFactor === null) {
            return invalidInput(res, 'ConversionId, ProductId, FromUnitId, ToUnitId, and ConversionFactor are required')
        }

        try {
            const request = new sql.Request();
            request.input('ConversionId', ConversionId);
            request.input('ProductId', ProductId);
            request.input('FromUnitId', FromUnitId);
            request.input('ToUnitId', ToUnitId);
            request.input('ConversionFactor', ConversionFactor);
            request.input('IsDefault', IsDefault);
            request.input('Remarks', Remarks || null);

            if (IsDefault === 1) {
                const updateRequest = new sql.Request();
                updateRequest.input('ProductId', ProductId);
                updateRequest.input('ConversionId', ConversionId);
                await updateRequest.query(`UPDATE tbl_Unit_Master_Product_Conversion SET IsDefault = 0 WHERE ProductId = @ProductId AND ConversionId != @ConversionId`);
            }

            const result = await request.query(`
                UPDATE tbl_Unit_Master_Product_Conversion
                SET 
                    ProductId = @ProductId,
                    FromUnitId = @FromUnitId,
                    ToUnitId = @ToUnitId,
                    ConversionFactor = @ConversionFactor,
                    IsDefault = @IsDefault,
                    Remarks = @Remarks
                WHERE ConversionId = @ConversionId
            `);

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Product unit mapping updated successfully');
            } else {
                return failed(res, 'No changes were made, the mapping might not exist');
            }
        } catch (e) {
            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    const deleteConversion = async (req, res) => {
        const { ConversionId } = req.body;

        if (!ConversionId) {
            return invalidInput(res, 'ConversionId is required')
        }

        try {
            const request = new sql.Request();
            request.input('ConversionId', ConversionId);

            const result = await request.query(`
                DELETE FROM tbl_Unit_Master_Product_Conversion WHERE ConversionId = @ConversionId
            `);

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Product unit mapping deleted successfully');
            } else {
                return failed(res, 'No changes were made, the mapping might not exist');
            }
        } catch (e) {
            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    return {
        getConversions,
        postConversion,
        putConversion,
        deleteConversion
    }
}

export default productUnitConversionController();
