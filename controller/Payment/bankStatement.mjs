import fetch from 'node-fetch';
import { sentData, servError, invalidInput } from '../../res.mjs';

const BankStatement = () => {
    const TOKEN_URL = "https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/accountstatement/oauth2/token";
    const SERVICE_URL = "https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/tmb_accountstatement_api/fetchstatement";

    const CLIENT_ID = process.env.TMB_CLIENT_ID;
    const CLIENT_SECRET = process.env.TMB_CLIENT_SECRET;

    const getToken = async (req, res) => {
        try {
            if (!CLIENT_ID || !CLIENT_SECRET) {
                return invalidInput(res, 'Some values Missing');
            }

            const params = new URLSearchParams();
            params.append("client_id", CLIENT_ID);
            params.append("client_secret", CLIENT_SECRET);
            params.append("scope", "actstmt");
            params.append("grant_type", "client_credentials");

            const response = await fetch(TOKEN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
                timeout: 20000
            });

            if (!response.ok) {
                const text = await response.text();
                return invalidInput(res, 'Some values Missing');
            }

            const data = await response.json();
            sentData(res, { token: data.access_token, expires_in: data.expires_in });
        } catch (err) {
            console.error("Get Token Error:", err.message);
            servError(err, res);
        }
    };


    const fetchStatement = async (req, res) => {
        try {
            if (!CLIENT_ID || !CLIENT_SECRET) {
                return invalidInput(res, 'Some values Missing');
            }


            const tokenParams = new URLSearchParams();
            tokenParams.append("client_id", CLIENT_ID);
            tokenParams.append("client_secret", CLIENT_SECRET);
            tokenParams.append("scope", "actstmt");
            tokenParams.append("grant_type", "client_credentials");

            const tokenRes = await fetch(TOKEN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: tokenParams.toString(),
                timeout: 20000
            });

            if (!tokenRes.ok) {
                return invalidInput(res, 'Some values Missing');
            }

            const tokenData = await tokenRes.json();
            const accessToken = tokenData.access_token;


            const payload = {
                accountNo: req.query.accountNo || "002700150950519",
                startDate: req.query.fromDate || "03-10-2025",
                endDate: req.query.toDate || "03-10-2025"
            };


            const statementRes = await fetch(SERVICE_URL, {
                method: "POST",
                body: JSON.stringify(payload),
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${accessToken}`,
                    "TMB-Client-Id": CLIENT_ID,
                    "TMB-Client-Secret": CLIENT_SECRET
                },
                timeout: 20000
            });

            if (!statementRes.ok) {
                const text = await statementRes.text();
                return invalidInput(res, 'Some values text Missing');
            }

            const statementData = await statementRes.json();
            sentData(res, statementData);

        } catch (err) {

            servError(err, res);
        }
    };

    return {
        getToken,
        fetchStatement
    };
};

export default BankStatement();
