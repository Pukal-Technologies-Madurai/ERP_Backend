import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, randomNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';

const proGroup = () => {

    const getProductGroups = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT *
                    FROM tbl_Product_Group`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    };

    const postProdGroup = async (req, res) => {
        const { Pro_Group, Created_By, Company_Id } = req.body;

        if (!Pro_Group) {
            return invalidInput(res, 'Pro_Group is required');
        }

        try {
            const checkExisting = await new sql.Request()
                .input('Pro_Group', Pro_Group)
                .query('SELECT 1 FROM tbl_Product_Group WHERE Pro_Group = @Pro_Group');

            if (checkExisting.recordset.length > 0) {
                return failed(res, 'Pro_Group already exists');
            }

            const getMaxId = await getNextId({ table: 'tbl_Product_Group', column: 'Pro_Group_Id' });

            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating Pro_Group ID');
            }

            const Pro_Group_Id = getMaxId.MaxId;
            const Alter_Id = randomNumber();
            const result = await new sql.Request()
                .input('Pro_Group_Id', Pro_Group_Id)
                .input('Pro_Group', Pro_Group)
                .input('Company_Id', Company_Id)
                .input('Alter_Id', Alter_Id)
                .input('Created_By', Created_By)
                .input('Created_Time', new Date())
                .query(`
                INSERT INTO tbl_Product_Group 
                (Pro_Group_Id, Pro_Group, Company_Id, Alter_Id, Created_By, Created_Time) 
                VALUES 
                (@Pro_Group_Id, @Pro_Group, @Company_Id, @Alter_Id, @Created_By, @Created_Time)
            `);

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                return success(res, 'Pro Group created successfully');
            } else {
                return failed(res, 'Failed to create Pro Group');
            }
        } catch (e) {
            return servError(e, res);
        }
    };

    const putProdGroup = async (req, res) => {
        const { Pro_Group_Id, Company_Id, Pro_Group, Alter_By } = req.body;

        if (!Pro_Group_Id || !Pro_Group) {
            return invalidInput(res, 'Pro_Group_Id, Pro_Group are required');
        }

        try {
            const Alter_Id = randomNumber();
            const Alter_Time = new Date();

            const result = await new sql.Request()
                .input('Pro_Group_Id', Pro_Group_Id)
                .input('Pro_Group', Pro_Group)
                .input('Company_Id', Company_Id)
                .input('Alter_Id', Alter_Id)
                .input('Alter_By', Alter_By)
                .input('Alter_Time', Alter_Time)
                .query(`
                UPDATE tbl_Product_Group
                SET 
                    Pro_Group = @Pro_Group,
                    Company_Id = @Company_Id,
                    Alter_Id = @Alter_Id,
                    Alter_By = @Alter_By,
                    Alter_Time = @Alter_Time
                WHERE Pro_Group_Id = @Pro_Group_Id
            `);

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Pro_Group updated successfully');
            } else {
                failed(res, 'Failed to save changes');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteProGroup = async (req, res) => {
        const { Pro_Group_Id } = req.body;

        if (!Pro_Group_Id) {
            return invalidInput(res, 'Pro_Group_Id is required');
        }

        try {
            const result = await new sql.Request()
                .input('Pro_Group_Id', Pro_Group_Id)
                .query('DELETE FROM tbl_Product_Group WHERE Pro_Group_Id = @Pro_Group_Id');

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Pro Group deleted successfully');
            } else {
                failed(res, 'Failed to delete Pro Group');
            }
        } catch (e) {
            servError(e, res);
        }
    };

const ItemGroupMaster = async (req, res) => {
    try {

        const groupResult = await sql.query(`
            SELECT 
                i.Item_Group_Id,
                i.Group_Name,
                i.Group_HSN,
                i.GST_P,
                d.Materail_Id,
                pm.Product_Name,
                pm.Product_Id,
                pg.Pro_Group_Id,
                pg.Pro_Group
            FROM [dbo].[tbl_Item_Group] i
            LEFT JOIN [dbo].[tbl_Item_Group_Details] d 
                ON i.Item_Group_Id = d.Item_Group_Id
            LEFT JOIN [dbo].[tbl_Product_Master] pm
                ON d.Materail_Id = pm.Product_Id
            LEFT JOIN [dbo].[tbl_Product_Group] pg
                ON pg.Pro_Group_Id = pm.Product_Group
            ORDER BY i.Item_Group_Id ASC
        `);

      
        const nonMappedResult = await sql.query(`
            SELECT 
                pm.Product_Id,
                pm.Product_Name,
                pg.Pro_Group_Id,
                pg.Pro_Group
            FROM [dbo].[tbl_Product_Master] pm
            LEFT JOIN [dbo].[tbl_Product_Group] pg
                ON pg.Pro_Group_Id = pm.Product_Group
            WHERE pm.Product_Id NOT IN (
                SELECT Materail_Id 
                FROM [dbo].[tbl_Item_Group_Details]
                WHERE Materail_Id IS NOT NULL
            )
            ORDER BY pm.Product_Name ASC
        `);


        const groupedMap = new Map();

        for (const row of groupResult.recordset) {
            if (!groupedMap.has(row.Item_Group_Id)) {
                groupedMap.set(row.Item_Group_Id, {
                    Item_Group_Id: row.Item_Group_Id,
                    Group_Name:    row.Group_Name,
                    Group_HSN:     row.Group_HSN,
                    GST_P:         row.GST_P,
                    details: []
                });
            }

            if (row.Materail_Id) {
                groupedMap.get(row.Item_Group_Id).details.push({
                    Materail_Id:  row.Materail_Id,
                    Product_Id:   row.Product_Id,
                    Pro_Group_Id: row.Pro_Group_Id,
                    Pro_Group:    row.Pro_Group,
                    Product_Name: row.Product_Name,
                });
            }
        }

        const itemGroups = Array.from(groupedMap.values());
        const nonMappedProducts = nonMappedResult.recordset;

        return res.status(200).json({
            success: true,
            message: 'Item groups fetched successfully',
            itemGroups,           // mapped groups with details[]
            nonMappedProducts,    // products not in any group
        });

    } catch (e) {
        servError(e, res);
    }
};
const ItemGroupMasterUpdate = async (req, res) => {
    try {
        const {
            Item_Group_Id,
            Group_Name,
            Group_HSN,
            GST_P,
            items
        } = req.body;

        // ── Validations ──────────────────────────────────────────────────────
        if (!Item_Group_Id) {
            return failed(res, 'Item Group ID is required');
        }

        if (!Group_Name) {
            return failed(res, 'Group name is required');
        }

        if (!Group_HSN) {
            return failed(res, 'HSN code is required');
        }

        if (GST_P === undefined || GST_P === null) {
            return failed(res, 'GST percentage is required');
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return failed(res, 'At least one item is required');
        }

        // ── Check group exists ───────────────────────────────────────────────
        const existsCheck = await new sql.Request()
            .input('Item_Group_Id', sql.Int, Item_Group_Id)
            .query(`
                SELECT Item_Group_Id FROM tbl_Item_Group 
                WHERE Item_Group_Id = @Item_Group_Id
            `);

        if (existsCheck.recordset.length === 0) {
            return failed(res, 'Item group not found');
        }

        // ── Check duplicate Group_Name (exclude current record) ──────────────
        const duplicateNameCheck = await new sql.Request()
            .input('Group_Name', sql.NVarChar, Group_Name)
            .input('Item_Group_Id', sql.Int, Item_Group_Id)
            .query(`
                SELECT Item_Group_Id FROM tbl_Item_Group 
                WHERE Group_Name = @Group_Name 
                  AND Item_Group_Id != @Item_Group_Id
            `);

        if (duplicateNameCheck.recordset.length > 0) {
            return failed(res, 'Another group with this name already exists');
        }

        // ── Check duplicate Group_HSN (exclude current record) ───────────────
        const duplicateHSNCheck = await new sql.Request()
            .input('Group_HSN', sql.NVarChar, Group_HSN)
            .input('Item_Group_Id', sql.Int, Item_Group_Id)
            .query(`
                SELECT Item_Group_Id FROM tbl_Item_Group 
                WHERE Group_HSN = @Group_HSN 
                  AND Item_Group_Id != @Item_Group_Id
            `);

        if (duplicateHSNCheck.recordset.length > 0) {
            return failed(res, 'Another group with this HSN code already exists');
        }

        // ── Transaction: update header + replace details ─────────────────────
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // 1. Update the group header
            await new sql.Request(transaction)
                .input('Item_Group_Id', sql.Int,        Item_Group_Id)
                .input('Group_Name',    sql.NVarChar,   Group_Name)
                .input('Group_HSN',     sql.NVarChar,   Group_HSN)
                .input('GST_P',         sql.Decimal(5, 2), GST_P)
                .query(`
                    UPDATE tbl_Item_Group
                    SET 
                        Group_Name = @Group_Name,
                        Group_HSN  = @Group_HSN,
                        GST_P      = @GST_P
                    WHERE Item_Group_Id = @Item_Group_Id
                `);

            // 2. Delete all previous detail rows for this group
            await new sql.Request(transaction)
                .input('Item_Group_Id', sql.Int, Item_Group_Id)
                .query(`
                    DELETE FROM tbl_Item_Group_Details 
                    WHERE Item_Group_Id = @Item_Group_Id
                `);

            // 3. Insert fresh detail rows
            for (const Materail_Id of items) {
                await new sql.Request(transaction)
                    .input('Item_Group_Id', sql.Int, Item_Group_Id)
                    .input('Materail_Id',   sql.Int, Materail_Id)
                    .query(`
                        INSERT INTO tbl_Item_Group_Details 
                            (Item_Group_Id, Materail_Id) 
                        VALUES 
                            (@Item_Group_Id, @Materail_Id)
                    `);
            }

            await transaction.commit();

            return success(res, 'Item group updated successfully.', {
                Item_Group_Id,
                Group_Name,
                total_items: items.length
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (e) {
        servError(e, res);
    }
};


const ItemGroupMasterCreate = async (req, res) => {
    try {
        const {
            Group_Name,
            Group_HSN,
            GST_P,
            items
        } = req.body;

    
        if (!Group_Name) {
            return failed(res, 'Group name is required');
        }

        if (!Group_HSN) {
            return failed(res, 'HSN code is required');
        }

        if (GST_P === undefined || GST_P === null) {
            return failed(res, 'GST percentage is required');
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return failed(res, 'At least one item is required');
        }

       
        const existingGroupCheck = await new sql.Request()
            .input('Group_Name', sql.NVarChar, Group_Name)
            .query(`
                SELECT Item_Group_Id FROM tbl_Item_Group 
                WHERE Group_Name = @Group_Name 
            `);

        if (existingGroupCheck.recordset.length > 0) {
            return failed(res, 'Group with this name already exists');
        }

        
        const existingHSNCheck = await new sql.Request()
            .input('Group_HSN', sql.NVarChar, Group_HSN)
            .query(`
                SELECT Item_Group_Id FROM tbl_Item_Group 
                WHERE Group_HSN = @Group_HSN
            `);

        if (existingHSNCheck.recordset.length > 0) {
            return failed(res, 'HSN code already exists');
        }

        
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            const getMaxId = await new sql.Request(transaction)
                .query('SELECT ISNULL(MAX(Item_Group_Id), 0) + 1 AS MaxId FROM tbl_Item_Group');
            
            const Item_Group_Id = getMaxId.recordset[0].MaxId;

       

            await new sql.Request(transaction)
                .input('Item_Group_Id', sql.Int, Item_Group_Id)
                .input('Group_Name', sql.NVarChar, Group_Name)
                .input('Group_HSN', sql.NVarChar, Group_HSN)
                .input('GST_P', sql.Decimal(5,2), GST_P)
                .query(`
                    INSERT INTO tbl_Item_Group 
                    (Item_Group_Id, Group_Name, Group_HSN, GST_P) 
                    VALUES 
                    (@Item_Group_Id, @Group_Name, @Group_HSN, @GST_P)
                `);

            for (const Materail_Id of items) {
          
             

                await new sql.Request(transaction)
                    .input('Item_Group_Id', sql.Int, Item_Group_Id)
                    .input('Materail_Id', sql.Int, Materail_Id)
                    .query(`
                        INSERT INTO tbl_Item_Group_Details 
                        ( Item_Group_Id, Materail_Id) 
                        VALUES 
                        ( @Item_Group_Id, @Materail_Id)
                    `);
            }

          
            await transaction.commit();

            return success(res, 'Item group created successfully.', { 
                Item_Group_Id,
                Group_Name,
                total_items: items.length 
            });

        } catch (error) {
          
            await transaction.rollback();
            throw error;
        }

    } catch (e) {
        servError(e, res);
    }
};


const stockGroupMaster = async (req, res) => {
    try {
        const { companyId } = req.query; 

     
        const result = await new sql.Request().query(
            `SELECT Pro_Group_Id as value, Pro_Group as label 
             FROM tbl_Product_Group 
             WHERE Company_Id = ${companyId}
             ORDER BY Pro_Group`
        );
        
        const groups = result.recordset;
      
        return res.status(200).json({
            success: true,
            data: groups
        });
        
    } catch (e) {
        servError(e, res);
    }
};


const ProductListStockGroup=async(req,res)=>{
try {
        const { Product_Group } = req.query; 

     
        const result = await new sql.Request().query(
            `SELECT Product_Id as value, Product_Name as label 
             FROM tbl_Product_Master 
             WHERE Product_Group = ${Product_Group}
            `
        );
        
        const groups = result.recordset;
      
        return res.status(200).json({
            success: true,
            data: groups
        });
        
    } catch (e) {
        servError(e, res);
    }
}


    return {
        getProductGroups,
        postProdGroup,
        putProdGroup,
        deleteProGroup,
        ItemGroupMaster,
        ItemGroupMasterCreate,
        stockGroupMaster,
        ProductListStockGroup,
        ItemGroupMasterUpdate
    }
}

export default proGroup();