import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const StockGroup = () => {
const getStockGroups = async (req, res) => {

 
    
 
    try {
                  const request = new sql.Request()   .query(`
                SELECT
                    St_Group_Id,
                    St_Group,
                    Alias_Name,
                    Parent_Id,
                    ERP_Id,
                    Alter_Id,
                    Created_By,
                    Created_Time,
                    Alter_By,
                    Alter_Time
                FROM tbl_Stock_Group
                ORDER BY St_Group
            `);
 
          const result = await request;

            sentData(res, result.recordset);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Failed to fetch stock groups' });
    }
};

const wouldCreateCycle = async (pool, companyId, stGroupId, parentId) => {
    if (!parentId || Number(parentId) === 0) return false;
    if (Number(parentId) === Number(stGroupId)) return true;
 
    let currentId = parentId;
    const visited = new Set();
 
    while (currentId && Number(currentId) !== 0) {
        if (Number(currentId) === Number(stGroupId)) return true;
        if (visited.has(currentId)) break; // corrupt data safety net
        visited.add(currentId);
 
        const result = await pool.request()
            .input('St_Group_Id', sql.Int, currentId)
            .input('Company_Id', sql.Int, companyId)
            .query(`
                SELECT Parent_Id FROM tbl_Stock_Group
                WHERE St_Group_Id = @St_Group_Id AND Company_Id = @Company_Id
            `);
 
        if (!result.recordset.length) break;
        currentId = result.recordset[0].Parent_Id;
    }
    return false;
};
 

const createStockGroup = async (req, res) => {
    const { Company_Id, St_Group, Alias_Name, Parent_Id, Created_By } = req.body;
 
    if (!Company_Id || !St_Group) {
        return res.status(400).json({ success: false, message: 'Company_Id and St_Group are required' });
    }
 
    try {
         const request = new sql.Request()
 
        // Duplicate name guard (same company)
        const dup = await request()
            .input('St_Group', sql.NVarChar, St_Group)
            .input('Company_Id', sql.Int, Company_Id)
            .query(`
                SELECT 1 FROM tbl_Stock_Group
                WHERE St_Group = @St_Group AND Company_Id = @Company_Id
            `);
        if (dup.recordset.length) {
            return res.status(409).json({ success: false, message: 'A stock group with this name already exists' });
        }
 
        const result = await request()
            .input('St_Group', sql.NVarChar, St_Group)
            .input('Alias_Name', sql.NVarChar, Alias_Name || null)
            .input('Parent_Id', sql.Int, Parent_Id || 0)
            .input('Company_Id', sql.Int, Company_Id)
            .input('Created_By', sql.Int, Created_By || null)
            .query(`
                INSERT INTO tbl_Stock_Group
                    (St_Group, Alias_Name, Parent_Id, Company_Id, Created_By, Created_Time)
                OUTPUT INSERTED.St_Group_Id
                VALUES
                    (@St_Group, @Alias_Name, @Parent_Id, @Company_Id, @Created_By, GETDATE())
            `);
 
      if (result.rowsAffected[0] > 0) {
                success(res, 'Stock created successfully');
            } else {
                failed(res, 'Failed to create state');
            }

        } catch (e) {

            servError(e, res);
        }
};
 

const updateStockGroup = async (req, res) => {
    const { St_Group_Id } = req.params;
    const { Company_Id, St_Group, Alias_Name, Parent_Id, Alter_By } = req.body;
 
    if (!Company_Id || !St_Group) {
        return res.status(400).json({ success: false, message: 'Company_Id and St_Group are required' });
    }
 
    try {
        const pool = await poolPromise;
 
        const cyclic = await wouldCreateCycle(pool, Company_Id, St_Group_Id, Parent_Id);
        if (cyclic) {
            return res.status(400).json({ success: false, message: 'That parent group would create a circular reference' });
        }
 
        // Duplicate name guard, excluding this row
        const dup = await pool.request()
            .input('St_Group', sql.NVarChar, St_Group)
            .input('Company_Id', sql.Int, Company_Id)
            .input('St_Group_Id', sql.Int, St_Group_Id)
            .query(`
                SELECT 1 FROM tbl_Stock_Group
                WHERE St_Group = @St_Group AND Company_Id = @Company_Id AND St_Group_Id <> @St_Group_Id
            `);
        if (dup.recordset.length) {
            return res.status(409).json({ success: false, message: 'A stock group with this name already exists' });
        }
 
        const result = await pool.request()
            .input('St_Group_Id', sql.Int, St_Group_Id)
            .input('St_Group', sql.NVarChar, St_Group)
            .input('Alias_Name', sql.NVarChar, Alias_Name || null)
            .input('Parent_Id', sql.Int, Parent_Id || 0)
            .input('Company_Id', sql.Int, Company_Id)
            .input('Alter_By', sql.Int, Alter_By || null)
            .query(`
                UPDATE tbl_Stock_Group
                SET St_Group = @St_Group,
                    Alias_Name = @Alias_Name,
                    Parent_Id = @Parent_Id,
                    Alter_By = @Alter_By,
                    Alter_Time = GETDATE()
                WHERE St_Group_Id = @St_Group_Id AND Company_Id = @Company_Id
            `);
 
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: 'Stock group not found' });
        }
 
        return res.json({ success: true, message: 'Stock group updated' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Failed to update stock group' });
    }
};

const stockGroupDropdown= async(req,res)=>{
    
    try {
                  const request = new sql.Request()   .query(`
                SELECT
                    St_Group_Id,
                    St_Group
                FROM tbl_Stock_Group
                ORDER BY St_Group_Id asc
            `);
 
          const result = await request;

            sentData(res, result.recordset);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Failed to fetch stock groups' });
    }
}
 
  return {
        getStockGroups,
        wouldCreateCycle,
        createStockGroup,
        updateStockGroup,
        stockGroupDropdown
    }
}


export default StockGroup();