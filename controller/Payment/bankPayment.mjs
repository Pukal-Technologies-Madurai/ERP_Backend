import { servError, success, failed, sentData, invalidInput, dataFound, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isArray, randomNumber, toArray, toNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql'
import axios from 'axios'



const BankPayment = () => {



const getToken = async (req, res) => {
  try {
    const TOKEN_URL =
      "https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/accountstatement/oauth2/token";

    const CLIENT_ID = process.env.TMB_CLIENT_ID;
    const CLIENT_SECRET = process.env.TMB_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return invalidInput(res, 'Required Field is missing');
    }

    const params = new URLSearchParams();
    params.append("client_id", CLIENT_ID);
    params.append("client_secret", CLIENT_SECRET);
    params.append("scope", "actstmt");
    params.append("grant_type", "client_credentials");

    const response = await axios.post(TOKEN_URL, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000, 
    });

    const data = {
      token: response.data.access_token,
      expires_in: response.data.expires_in
    };

    
    dataFound(res, data);

  } catch (err) {
    console.error("Token Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const fetchStatement = async (req, res) => {
  try {
    const SERVICE_URL =
      "https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/tmb_accountstatement_api/fetchstatement";

    const TOKEN_URL =
      "https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/accountstatement/oauth2/token";

    const CLIENT_ID = process.env.TMB_CLIENT_ID;
    const CLIENT_SECRET = process.env.TMB_CLIENT_SECRET;



    const tokenResponse = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "actstmt",
        grant_type: "client_credentials"
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );


    const accessToken = tokenResponse.data.access_token;


    const payload = {
      accountNo: req.body.accountNo || "002700150950519",
      startDate: req.body.startDate || "03-10-2025",
      endDate: req.body.endDate || "03-10-2025"
    };


    const response = await axios.post(SERVICE_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "TMB-Client-Id": CLIENT_ID
      },
      timeout: 20000 
    });

     dataFound(res, response.data);

  } catch (err) {
  
     servError(err, res);
  }
};




    return {
       
        fetchStatement,
        getToken
    }
}


export default BankPayment();