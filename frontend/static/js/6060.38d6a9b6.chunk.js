"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[6060],{64568:(e,a,s)=>{s.d(a,{c:()=>t});var l=s(82496);const t=()=>(0,l.jsx)("span",{style:{color:"red",fontWeight:"bold",fontSize:"1em"},children:" *"})},62344:(e,a,s)=>{s.d(a,{o$:()=>r,o5:()=>i,cF:()=>n,iI:()=>t});const l=s.p+"static/media/smt.aa4d4f940bbebff07a57.png",t={table:{style:{width:"auto",backgroundColor:"transparent"}},rows:{style:{backgroundColor:"transparent"}},headCells:{style:{backgroundColor:"#6b9080f8",color:"white",fontSize:"14px"}}},n={control:(e,a)=>({...e,height:"45px",background:"rgba(255, 255, 255, 0.322)"}),menu:(e,a)=>({...e,zIndex:9999})},r=[{id:1,headname:"Menu ID",variant:"head",align:"left",width:100},{id:2,headname:"MenuName"},{id:3,headname:"Read Rights"},{id:4,headname:"Add Rights"},{id:5,headname:"Edit Rights"},{id:6,headname:"Delete Rights"},{id:7,headname:"Print Rights"},{id:8,headname:"Action"}],i=[{dataBase:1,name:"SHANKAR TRADERS",business:"Wholesale Merchant in Dhall",address:"32, Chitrakara Street, Madurai - 01 <br /> Bill of Supply -Disclaimer Affidavlt Field Extemped",logo:l,gstin:"33AADFS6973R1ZD",phone:"984-313-1353, 984-335-5166",fssai:"12418012000818",bankAccount:"0021 5032 0885 122",ifsc:"TMBL0000002"},{dataBase:2,name:"SMT AGRO PRODUCTS",business:"",address:"H.O: 153, Chitrakara Street, 2nd Floor, Madurai -01 <br /> G.O: 746 Puliyur, Sayanapuram, Svga <br /> Bill of Supply -Disclaimer Affidavlt Field Extemped",logo:l,gstin:"33ACMFS3420Q1ZQ",phone:"0452-4371625",fssai:"12418012000818",bankAccount:"0025 3031 0875 947",ifsc:"TMBL0000002"},{dataBase:3,name:"BHAVANI TRADERS",business:"",address:"H.O: 152-A, Chitrakara Street, Madurai -01 <br /> G.O: 30/1-Rajman Nagar, Chintamani Main Road, Mdu-01 <br /> Tax Invoice",logo:l,gstin:"33AAEFB6728J1ZG",phone:"958-559-7641, 958-559-7614",fssai:"12418012000670",bankAccount:"0021 5005 0800 309",ifsc:"TMBL0000002"}]},80556:(e,a,s)=>{s.r(a),s.d(a,{default:()=>P});var l=s(43692),t=s(84436),n=s(89e3),r=s(5548),i=s(82656),c=s(26773),d=s(4488),o=s(90048),h=s(69060),m=s(30612),x=s(62344),u=s(64568),j=s(1908),v=s(39308),p=s(96064),N=s(45180),g=s(56084),y=s(36992),b=s(51560),D=s(82496);const C=JSON.parse(localStorage.getItem("user")),f={Id:"",LoadingDate:"",TradeConfirmDate:"",OwnerName:"",BrokerName:"",PartyName:"",PartyAddress:"",PaymentCondition:"",Remarks:"",CreatedBy:null===C||void 0===C?void 0:C.UserId},S={Id:"",Sno:"",OrderId:"",ItemId:"",ItemName:"",Weight:"",Units:"",Rate:"",DeliveryLocation:"",Discount:"",QualityCondition:""},I={Id:"",Sno:"",OrderId:"",Location:"",ArrivalDate:"",ItemId:"",ItemName:"",Concern:"",BillNo:"",BillDate:"",Quantity:"",Weight:"",Units:"",BatchLocation:"",PendingQuantity:"",CreatedBy:null===C||void 0===C?void 0:C.UserId},O={Id:"",OrderId:"",Loading_Load:"",Loading_Empty:"",Unloading_Load:"",Unloading_Empty:"",EX_SH:"",DriverName:"",VehicleNo:"",PhoneNumber:"",CreatedBy:null===C||void 0===C?void 0:C.UserId},P=e=>{let{loadingOn:a,loadingOff:s,OrderId:C}=e;const P=(0,b.i6)(),[E,L]=(0,h.useState)([]),[k,A]=(0,h.useState)([]),[w,R]=(0,h.useState)([]),[B,W]=(0,h.useState)([]),[T,M]=(0,h.useState)(f),[_,U]=(0,h.useState)(S),[Q,H]=(0,h.useState)(I),[z,F]=(0,h.useState)(O),[V,q]=(0,h.useState)({itemsDialog:!1,deliveryDialog:!1,transporterDialog:!1}),X="border fa-14 vctr",G="cus-inpt p-2",J=JSON.parse(localStorage.getItem("user")),[Z,K]=(0,h.useState)({PurchaseOrderOnly:!0,PurchaseOderWithDelivery:!1,DeliveryEntry:!1});(0,h.useEffect)((()=>{(0,j.q)({address:"masters/products?Company_Id=".concat(null===J||void 0===J?void 0:J.Company_id)}).then((e=>{e.success?L(e.data):L([])})).catch((e=>console.error(e)))}),[]);const Y=e=>{const{id:a}=e.target;K({PurchaseOrderOnly:"PurchaseOrderOnly"===a,PurchaseOderWithDelivery:"PurchaseOderWithDelivery"===a,DeliveryEntry:"DeliveryEntry"===a})};return(0,h.useEffect)((()=>{M(f),A([]),R([]),W([])}),[Z]),(0,D.jsx)(l.c,{children:(0,D.jsxs)(t.c,{children:[(0,D.jsxs)("div",{className:"d-flex flex-wrap",children:[(0,D.jsx)("h5",{className:"flex-grow-1",children:"Purchase Order"}),(0,D.jsx)(n.c,{variant:"outlined",onClick:()=>P("/dataEntry/purchaseOrder"),children:"back"})]}),(0,D.jsx)("form",{onSubmit:e=>e.preventDefault(),children:(0,D.jsxs)("div",{className:"d-flex justify-content-center flex-wrap p-2 mb-2",children:[(0,D.jsxs)("div",{className:"form-check",children:[(0,D.jsx)("input",{className:"form-check-input shadow-none",style:{padding:"0.7em"},type:"radio",name:"radioType",id:"PurchaseOrderOnly",checked:Z.PurchaseOrderOnly,onChange:Y}),(0,D.jsx)("label",{className:"form-check-label p-1 me-3",htmlFor:"PurchaseOrderOnly",children:"Purchase Order"})]}),(0,D.jsxs)("div",{className:"form-check",children:[(0,D.jsx)("input",{className:"form-check-input shadow-none",style:{padding:"0.7em"},type:"radio",name:"radioType",id:"DeliveryEntry",checked:Z.DeliveryEntry,onChange:Y}),(0,D.jsx)("label",{className:"form-check-label p-1 me-3",htmlFor:"DeliveryEntry",children:"Arrival Details"})]}),(0,D.jsxs)("div",{className:"form-check",children:[(0,D.jsx)("input",{className:"form-check-input shadow-none",style:{padding:"0.7em"},type:"radio",name:"radioType",id:"PurchaseOderWithDelivery",checked:Z.PurchaseOderWithDelivery,onChange:Y}),(0,D.jsx)("label",{className:"form-check-label p-1 me-3",htmlFor:"PurchaseOderWithDelivery",children:"Order With Arrival"})]})]})}),(0,D.jsxs)("div",{className:"table-responsive",children:[Z.DeliveryEntry&&(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)("label",{children:"Order ID"}),":",(0,D.jsx)("input",{value:T.Id,className:G+" w-auto ms-2 mb-2",onChange:e=>M((a=>({...a,Id:e.target.value}))),placeholder:"Ex: 233"})]}),(Z.PurchaseOrderOnly||Z.PurchaseOderWithDelivery)&&(0,D.jsx)("table",{className:"table m-0",children:(0,D.jsxs)("tbody",{children:[(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X+" text-primary fw-bold bg-light",children:"ORDER DETAILS"}),(0,D.jsx)("td",{className:X+" text-primary text-end fw-bold bg-light",children:"PARTY DETAILS"})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("table",{className:"table m-0 border-0",children:(0,D.jsxs)("tbody",{children:[(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Loading Date"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{type:"date",className:G+" border-0",value:T.LoadingDate,onChange:e=>M((a=>({...a,LoadingDate:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Trade Confirm Date"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{type:"date",className:G+" border-0",value:T.TradeConfirmDate,onChange:e=>M((a=>({...a,TradeConfirmDate:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Owner Name"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{className:G+" border-0",value:T.OwnerName,onChange:e=>M((a=>({...a,OwnerName:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Broker Name"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{className:G+" border-0",value:T.BrokerName,onChange:e=>M((a=>({...a,BrokerName:e.target.value})))})})]})]})})}),(0,D.jsx)("td",{className:X,children:(0,D.jsxs)("div",{className:"d-flex flex-wrap bg-white",children:[(0,D.jsxs)("span",{className:"flex-grow-1 p-2",children:[(0,D.jsx)("h6",{children:"Party Name"}),(0,D.jsx)("input",{className:G+" mb-2",value:T.PartyName,onChange:e=>M((a=>({...a,PartyName:e.target.value})))}),(0,D.jsx)("br",{}),(0,D.jsx)("h6",{children:"Party Address"}),(0,D.jsx)("textarea",{className:G+" mb-2",rows:3,value:T.PartyAddress,onChange:e=>M((a=>({...a,PartyAddress:e.target.value})))})]}),(0,D.jsxs)("span",{className:"p-2",children:[(0,D.jsx)("h6",{children:"Payment Condition"}),(0,D.jsx)("textarea",{className:G,rows:2,value:T.PaymentCondition,onChange:e=>M((a=>({...a,PaymentCondition:e.target.value})))}),(0,D.jsx)("h6",{children:"Remarks"}),(0,D.jsx)("textarea",{className:G,rows:2,value:T.Remarks,onChange:e=>M((a=>({...a,Remarks:e.target.value})))})]})]})})]}),(0,D.jsx)("tr",{children:(0,D.jsx)("td",{className:"p-3",colSpan:2})})]})}),(Z.PurchaseOrderOnly||Z.PurchaseOderWithDelivery)&&!Z.DeliveryEntry&&(0,D.jsxs)("table",{className:"table m-0",children:[(0,D.jsxs)("thead",{children:[(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X+" text-primary fw-bold bg-light",colSpan:6,children:"ORDER ITEMS"}),(0,D.jsx)("td",{className:X+" text-end bg-light p-0",children:(0,D.jsx)(n.c,{startIcon:(0,D.jsx)(p.c,{}),varient:"outlined",onClick:()=>q((e=>({...e,itemsDialog:!0}))),children:"Add Product"})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("th",{className:X+" text-center",children:"SNo"}),(0,D.jsx)("th",{className:X+" text-center",children:"Item Name"}),(0,D.jsx)("th",{className:X+" text-center",children:"Tonnage"}),(0,D.jsxs)("th",{className:X+" text-center",children:["Rate ",(0,D.jsx)("br",{}),"Deliver/Spot"]}),(0,D.jsx)("th",{className:X+" text-center",children:"Discount"}),(0,D.jsx)("th",{className:X+" text-center",children:"Quality Condition"}),(0,D.jsx)("th",{className:X+" text-center",children:"Action"})]})]}),(0,D.jsxs)("tbody",{children:[k.map(((e,a)=>(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:a+1}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.ItemName}),(0,D.jsx)("td",{className:X,children:(null===e||void 0===e?void 0:e.Weight)+" "+(null===e||void 0===e?void 0:e.Units)}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Rate}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Discount}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.QualityCondition}),(0,D.jsx)("td",{className:X+" p-0 text-center",children:(0,D.jsx)(r.c,{onClick:()=>{A((e=>e.filter(((e,s)=>s!==a))))},size:"small",children:(0,D.jsx)(N.c,{color:"error"})})})]},a))),(0,D.jsx)("tr",{children:(0,D.jsx)("td",{className:"p-3",colSpan:7})})]})]}),(Z.PurchaseOderWithDelivery||Z.DeliveryEntry)&&(0,D.jsxs)(D.Fragment,{children:[(0,D.jsxs)("table",{className:"table m-0",children:[(0,D.jsxs)("thead",{children:[(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X+" text-primary fw-bold bg-light",colSpan:11,children:"DELIVERY DETAILS"}),(0,D.jsx)("td",{className:X+" text-end bg-light p-0",children:(0,D.jsx)(n.c,{startIcon:(0,D.jsx)(p.c,{}),varient:"outlined",onClick:()=>q((e=>({...e,deliveryDialog:!0}))),children:"Add Delivery"})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("th",{className:X+" text-center",children:"SNo"}),(0,D.jsx)("th",{className:X+" text-center",children:"Location"}),(0,D.jsx)("th",{className:X+" text-center",children:"Arrival Date"}),(0,D.jsx)("th",{className:X+" text-center",children:"Item Name"}),(0,D.jsx)("th",{className:X+" text-center",children:"Concern"}),(0,D.jsx)("th",{className:X+" text-center",children:"Bill No"}),(0,D.jsx)("th",{className:X+" text-center",children:"Bill Date"}),(0,D.jsx)("th",{className:X+" text-center",children:"Quantity"}),(0,D.jsx)("th",{className:X+" text-center",children:"Tonnage / KGs"}),(0,D.jsx)("th",{className:X+" text-center",children:"Batch / Location"}),(0,D.jsx)("th",{className:X+" text-center",children:"Pending Quantity"}),(0,D.jsx)("th",{className:X+" text-center",children:"Action"})]})]}),(0,D.jsxs)("tbody",{children:[w.map(((e,a)=>(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:a+1}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Location}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.ArrivalDate}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.ItemName}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Concern}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.BillNo}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.BillDate}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Quantity}),(0,D.jsx)("td",{className:X,children:(null===e||void 0===e?void 0:e.Weight)+" "+(null===e||void 0===e?void 0:e.Units)}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.BatchLocation}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.PendingQuantity}),(0,D.jsx)("td",{className:X+" p-0 text-center",children:(0,D.jsx)(r.c,{onClick:()=>{R((e=>e.filter(((e,s)=>s!==a))))},size:"small",children:(0,D.jsx)(N.c,{color:"error"})})})]},a))),(0,D.jsx)("tr",{children:(0,D.jsx)("td",{className:"p-3",colSpan:12})})]})]}),(0,D.jsxs)("table",{className:"table m-0",children:[(0,D.jsxs)("thead",{children:[(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X+" text-primary fw-bold bg-light",colSpan:9,children:"OTHER DETAILS"}),(0,D.jsx)("td",{className:X+" text-end bg-light p-0",children:(0,D.jsx)(n.c,{startIcon:(0,D.jsx)(p.c,{}),varient:"outlined",onClick:()=>q((e=>({...e,transporterDialog:!0}))),children:"Add Transporter"})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("th",{className:X+" text-center",rowSpan:2,children:"SNo"}),(0,D.jsx)("th",{className:X+" text-center",colSpan:2,children:"Loading Wt"}),(0,D.jsx)("th",{className:X+" text-center",colSpan:2,children:"Unloading Wt"}),(0,D.jsx)("th",{className:X+" text-center",children:"Weight"}),(0,D.jsx)("th",{className:X+" text-center",colSpan:3,children:"Transport Details"}),(0,D.jsx)("th",{className:X+" text-center",rowSpan:2,children:"Action"})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("th",{className:X+" text-center",children:"Load"}),(0,D.jsx)("th",{className:X+" text-center",children:"Empty"}),(0,D.jsx)("th",{className:X+" text-center",children:"Load"}),(0,D.jsx)("th",{className:X+" text-center",children:"Empty"}),(0,D.jsx)("th",{className:X+" text-center",children:"EX / SH"}),(0,D.jsx)("th",{className:X+" text-center",children:"Name"}),(0,D.jsx)("th",{className:X+" text-center",children:"Vehicle No"}),(0,D.jsx)("th",{className:X+" text-center",children:"Phone Number"})]})]}),(0,D.jsxs)("tbody",{children:[B.map(((e,a)=>(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:a+1}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Loading_Load}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Loading_Empty}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Unloading_Load}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.Unloading_Empty}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.EX_SH}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.DriverName}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.VehicleNo}),(0,D.jsx)("td",{className:X,children:null===e||void 0===e?void 0:e.PhoneNumber}),(0,D.jsx)("td",{className:X+" p-0 text-center",children:(0,D.jsx)(r.c,{onClick:()=>{W((e=>e.filter(((e,s)=>s!==a))))},size:"small",children:(0,D.jsx)(N.c,{color:"error"})})})]},a))),(0,D.jsx)("tr",{children:(0,D.jsx)("td",{className:X+" p-3",colSpan:10})})]})]})]}),(0,D.jsxs)("div",{className:"d-flex justify-content-end flex-wrap my-3",children:[(0,D.jsx)(n.c,{onClick:()=>{M(f),A([]),R([]),W([])},className:"me-2",variant:"outlined",startIcon:(0,D.jsx)(g.c,{}),children:"Clear Values"}),(0,D.jsx)(n.c,{onClick:Z.DeliveryEntry?()=>{a&&a(),T.Id&&(0,j.q)({address:"dataEntry/purchaseOrderEntry/ArrivalUpdate",method:"PUT",bodyData:{OrderId:T.Id,DelivdryDetails:Z.PurchaseOrderOnly?[]:w,TranspoterDetails:Z.PurchaseOrderOnly?[]:B}}).then((e=>{null!==e&&void 0!==e&&e.success&&(M(f),A([]),R([]),W([]))})).catch((e=>console.error(e))).finally((()=>{s&&s()}))}:()=>{a&&a(),(0,j.q)({address:"dataEntry/purchaseOrderEntry",method:"POST",bodyData:{OrderDetails:T,OrderItems:k,DelivdryDetails:Z.PurchaseOrderOnly?[]:w,TranspoterDetails:Z.PurchaseOrderOnly?[]:B}}).then((e=>{null!==e&&void 0!==e&&e.success&&(M(f),A([]),R([]),W([]))})).catch((e=>console.error(e))).finally((()=>{s&&s()}))},variant:"contained",startIcon:(0,D.jsx)(y.c,{}),disabled:(()=>{const e=(0,v.Qr)(k.length,0),a=!T.PartyName,s=(0,v.Qr)(w.length,0)&&(0,v.Qr)(B.length,0),l=!T.Id;return Z.PurchaseOrderOnly&&(e||a)||Z.PurchaseOderWithDelivery&&(s&&e||a)||Z.DeliveryEntry&&(l||s)})(),children:"Save"})]})]}),(0,D.jsxs)(i.c,{open:V.itemsDialog,onClose:()=>q((e=>({...e,itemsDialog:!1}))),maxWidth:"sm",fullWidth:!0,children:[(0,D.jsx)(c.c,{children:"Add Items"}),(0,D.jsxs)("form",{onSubmit:e=>{e.preventDefault(),(e=>{const a=k.findIndex((a=>(0,v.Qr)(a.Item_Id,e.Item_Id)));if(-1!==a){const s=[...k];Object.entries(e).forEach((e=>{let[l,t]=e;s[a][l]=t})),A(s)}else A((a=>[...a,{...e}]));U(S),q((e=>({...e,itemsDialog:!1})))})(_)},children:[(0,D.jsx)(d.c,{children:(0,D.jsx)("table",{className:"table m-0",children:(0,D.jsxs)("tbody",{children:[(0,D.jsxs)("tr",{children:[(0,D.jsxs)("td",{className:X,children:["Item Name ",(0,D.jsx)(u.c,{})]}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)(m.cp,{value:{value:_.ItemId,label:_.ItemName},onChange:e=>U((a=>({...a,ItemId:e.value,ItemName:e.label}))),options:[{value:"",label:"select",isDisabled:!0},...E.map((e=>({value:null===e||void 0===e?void 0:e.Product_Id,label:null===e||void 0===e?void 0:e.Product_Name})))],styles:x.cF,required:!0,isSearchable:!0,placeholder:"Select Product",maxMenuHeight:200})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsxs)("td",{className:X,children:["Weight ",(0,D.jsx)(u.c,{})]}),(0,D.jsxs)("td",{className:X,children:[(0,D.jsx)("input",{type:"number",className:"cus-inpt p-2 w-auto",value:_.Weight,required:!0,placeholder:"Weight",onChange:e=>U((a=>({...a,Weight:e.target.value})))}),(0,D.jsx)("input",{className:"cus-inpt p-2 w-auto",value:_.Units,placeholder:"Units ex: kg, l, ml...",onChange:e=>U((a=>({...a,Units:e.target.value})))})]})]}),(0,D.jsxs)("tr",{children:[(0,D.jsxs)("td",{className:X,children:["Rate ",(0,D.jsx)(u.c,{})]}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{type:"number",required:!0,className:"cus-inpt p-2",value:_.Rate,placeholder:"Rate",onChange:e=>U((a=>({...a,Rate:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsxs)("td",{className:X,children:["Delivery Location ",(0,D.jsx)(u.c,{})]}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{className:"cus-inpt p-2",required:!0,value:_.DeliveryLocation,placeholder:"Location ",onChange:e=>U((a=>({...a,DeliveryLocation:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Discount"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{type:"number",className:"cus-inpt p-2",placeholder:"Discount Amount",value:_.Discount,onChange:e=>U((a=>({...a,Discount:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Quality Condition"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{className:"cus-inpt p-2",value:_.QualityCondition,placeholder:"Pencentage or condition",onChange:e=>U((a=>({...a,QualityCondition:e.target.value})))})})]})]})})}),(0,D.jsxs)(o.c,{className:"d-flex justify-content-between",children:[(0,D.jsx)("span",{children:(0,D.jsx)(n.c,{variant:"outlined",type:"button",onClick:()=>U(S),children:"clear"})}),(0,D.jsxs)("span",{children:[(0,D.jsx)(n.c,{variant:"outlined",className:"me-2",type:"button",onClick:()=>q((e=>({...e,itemsDialog:!1}))),children:"cancel"}),(0,D.jsx)(n.c,{variant:"contained",type:"submit",children:"submit"})]})]})]})]}),(0,D.jsxs)(i.c,{open:V.deliveryDialog,onClose:()=>q((e=>({...e,deliveryDialog:!1}))),maxWidth:"md",fullWidth:!0,children:[(0,D.jsx)(c.c,{children:"Add Delivery Details"}),(0,D.jsxs)("form",{onSubmit:e=>{var a;e.preventDefault(),a=Q,R((e=>[...e,{...a}])),H(I),q((e=>({...e,deliveryDialog:!1})))},children:[(0,D.jsx)(d.c,{children:(0,D.jsx)("table",{className:"table m-0",children:(0,D.jsxs)("tbody",{children:[(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Location"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{className:"cus-inpt p-2",value:null===Q||void 0===Q?void 0:Q.Location,onChange:e=>H((a=>({...a,Location:e.target.value}))),placeholder:"Location"})}),(0,D.jsx)("td",{className:"border-0"}),(0,D.jsx)("td",{className:X,children:"Arrival Date"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{type:"date",value:null===Q||void 0===Q?void 0:Q.ArrivalDate,className:"cus-inpt p-2",onChange:e=>H((a=>({...a,ArrivalDate:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Item Name"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)(m.cp,{value:{value:null===Q||void 0===Q?void 0:Q.ItemId,label:null===Q||void 0===Q?void 0:Q.ItemName},onChange:e=>H((a=>({...a,ItemId:e.value,ItemName:e.label}))),options:[{value:"",label:"select",isDisabled:!0},...E.map((e=>({value:null===e||void 0===e?void 0:e.Product_Id,label:null===e||void 0===e?void 0:e.Product_Name})))],styles:x.cF,required:!0,isSearchable:!0,placeholder:"Select Product",maxMenuHeight:200})}),(0,D.jsx)("td",{className:"border-0"}),(0,D.jsx)("td",{className:X,children:"Concern"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{className:"cus-inpt p-2",value:null===Q||void 0===Q?void 0:Q.Concern,onChange:e=>H((a=>({...a,Concern:e.target.value}))),placeholder:""})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Bill No"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{className:"cus-inpt p-2",value:null===Q||void 0===Q?void 0:Q.BillNo,onChange:e=>H((a=>({...a,BillNo:e.target.value}))),placeholder:""})}),(0,D.jsx)("td",{className:"border-0"}),(0,D.jsx)("td",{className:X,children:"Bill Date"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{type:"date",value:null===Q||void 0===Q?void 0:Q.BillDate,className:"cus-inpt p-2",onChange:e=>H((a=>({...a,BillDate:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Quantity"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{type:"number",value:null===Q||void 0===Q?void 0:Q.Quantity,className:"cus-inpt p-2",onChange:e=>H((a=>({...a,Quantity:e.target.value})))})}),(0,D.jsx)("td",{className:"border-0"}),(0,D.jsx)("td",{className:X,children:"Tonnage"}),(0,D.jsxs)("td",{className:X,children:[(0,D.jsx)("input",{type:"number",value:null===Q||void 0===Q?void 0:Q.Weight,className:"cus-inpt p-2 w-50",placeholder:"Weight",onChange:e=>H((a=>({...a,Weight:e.target.value})))}),(0,D.jsx)("input",{value:null===Q||void 0===Q?void 0:Q.Units,className:"cus-inpt p-2 w-50",placeholder:"Units ex: kg, L, ml",onChange:e=>H((a=>({...a,Units:e.target.value})))})]})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Batch / Location"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{className:"cus-inpt p-2",value:null===Q||void 0===Q?void 0:Q.BatchLocation,onChange:e=>H((a=>({...a,BatchLocation:e.target.value}))),placeholder:"location or batch"})}),(0,D.jsx)("td",{className:"border-0"}),(0,D.jsx)("td",{className:X,children:"Pending Quantity"}),(0,D.jsx)("td",{className:X,children:(0,D.jsx)("input",{type:"number",value:null===Q||void 0===Q?void 0:Q.PendingQuantity,className:"cus-inpt p-2",placeholder:"penging quantity",onChange:e=>H((a=>({...a,PendingQuantity:e.target.value})))})})]})]})})}),(0,D.jsxs)(o.c,{className:"d-flex justify-content-between",children:[(0,D.jsx)("span",{children:(0,D.jsx)(n.c,{variant:"outlined",type:"button",onClick:()=>U(S),children:"clear"})}),(0,D.jsxs)("span",{children:[(0,D.jsx)(n.c,{variant:"outlined",className:"me-2",type:"button",onClick:()=>q((e=>({...e,deliveryDialog:!1}))),children:"cancel"}),(0,D.jsx)(n.c,{variant:"contained",type:"submit",children:"submit"})]})]})]})]}),(0,D.jsxs)(i.c,{open:V.transporterDialog,onClose:()=>q((e=>({...e,transporterDialog:!1}))),maxWidth:"sm",fullWidth:!0,children:[(0,D.jsx)(c.c,{children:"Add Transporter Details"}),(0,D.jsxs)("form",{onSubmit:e=>{var a;e.preventDefault(),a=z,W((e=>[...e,{...a}])),F(O),q((e=>({...e,transporterDialog:!1})))},children:[(0,D.jsx)(d.c,{children:(0,D.jsx)("table",{className:"table m-0",children:(0,D.jsxs)("tbody",{children:[(0,D.jsx)("tr",{children:(0,D.jsx)("td",{className:X+" text-center bg-light",colSpan:4,children:"Loading Details"})}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Load"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{type:"number",value:null===z||void 0===z?void 0:z.Loading_Load,className:G+" border-0",onChange:e=>F((a=>({...a,Loading_Load:e.target.value})))})}),(0,D.jsx)("td",{className:X,children:"Empty"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{type:"number",value:null===z||void 0===z?void 0:z.Loading_Empty,className:G+" border-0",onChange:e=>F((a=>({...a,Loading_Empty:e.target.value})))})})]}),(0,D.jsx)("tr",{children:(0,D.jsx)("td",{className:X+" text-center bg-light",colSpan:4,children:"Unloading Details"})}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,children:"Load"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{type:"number",value:null===z||void 0===z?void 0:z.Unloading_Load,className:G+" border-0",onChange:e=>F((a=>({...a,Unloading_Load:e.target.value})))})}),(0,D.jsx)("td",{className:X,children:"Empty"}),(0,D.jsx)("td",{className:X+" p-0",children:(0,D.jsx)("input",{type:"number",value:null===z||void 0===z?void 0:z.Unloading_Empty,className:G+" border-0",onChange:e=>F((a=>({...a,Unloading_Empty:e.target.value})))})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,colSpan:2,children:"EX SH"}),(0,D.jsx)("td",{className:X+" p-0",colSpan:2,children:(0,D.jsx)("input",{value:null===z||void 0===z?void 0:z.EX_SH,onChange:e=>F((a=>({...a,EX_SH:e.target.value}))),className:G+" border-0"})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,colSpan:2,children:"Driver Name"}),(0,D.jsx)("td",{className:X+" p-0",colSpan:2,children:(0,D.jsx)("input",{value:null===z||void 0===z?void 0:z.DriverName,onChange:e=>F((a=>({...a,DriverName:e.target.value}))),className:G+" border-0"})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,colSpan:2,children:"Vehicle No"}),(0,D.jsx)("td",{className:X+" p-0",colSpan:2,children:(0,D.jsx)("input",{value:null===z||void 0===z?void 0:z.VehicleNo,onChange:e=>F((a=>({...a,VehicleNo:e.target.value}))),className:G+" border-0"})})]}),(0,D.jsxs)("tr",{children:[(0,D.jsx)("td",{className:X,colSpan:2,children:"Phone Number"}),(0,D.jsx)("td",{className:X+" p-0",colSpan:2,children:(0,D.jsx)("input",{type:"number",value:null===z||void 0===z?void 0:z.PhoneNumber,onChange:e=>F((a=>({...a,PhoneNumber:e.target.value}))),className:G+" border-0",maxLength:15})})]})]})})}),(0,D.jsxs)(o.c,{className:"d-flex justify-content-between",children:[(0,D.jsx)("span",{children:(0,D.jsx)(n.c,{variant:"outlined",type:"button",onClick:()=>F(O),children:"clear"})}),(0,D.jsxs)("span",{children:[(0,D.jsx)(n.c,{variant:"outlined",className:"me-2",type:"button",onClick:()=>q((e=>({...e,transporterDialog:!1}))),children:"cancel"}),(0,D.jsx)(n.c,{variant:"contained",type:"submit",children:"submit"})]})]})]})]})]})})}},96064:(e,a,s)=>{s.d(a,{c:()=>n});var l=s(27664),t=s(82496);const n=(0,l.c)((0,t.jsx)("path",{d:"M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"}),"Add")},56084:(e,a,s)=>{s.d(a,{c:()=>n});var l=s(27664),t=s(82496);const n=(0,l.c)((0,t.jsx)("path",{d:"M5 13h14v-2H5zm-2 4h14v-2H3zM7 7v2h14V7z"}),"ClearAll")},45180:(e,a,s)=>{s.d(a,{c:()=>n});var l=s(27664),t=s(82496);const n=(0,l.c)((0,t.jsx)("path",{d:"M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"}),"Delete")},36992:(e,a,s)=>{s.d(a,{c:()=>n});var l=s(27664),t=s(82496);const n=(0,l.c)((0,t.jsx)("path",{d:"M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3m3-10H5V5h10z"}),"Save")},84436:(e,a,s)=>{s.d(a,{c:()=>v});var l=s(45072),t=s(95656),n=s(69060),r=s(79736),i=s(21412),c=s(12556),d=s(49836),o=s(10099),h=s(33448);function m(e){return(0,h.cp)("MuiCardContent",e)}(0,o.c)("MuiCardContent",["root"]);var x=s(82496);const u=["className","component"],j=(0,c.cp)("div",{name:"MuiCardContent",slot:"Root",overridesResolver:(e,a)=>a.root})((()=>({padding:16,"&:last-child":{paddingBottom:24}}))),v=n.forwardRef((function(e,a){const s=(0,d.C)({props:e,name:"MuiCardContent"}),{className:n,component:c="div"}=s,o=(0,t.c)(s,u),h=(0,l.c)({},s,{component:c}),v=(e=>{const{classes:a}=e;return(0,i.c)({root:["root"]},m,a)})(h);return(0,x.jsx)(j,(0,l.c)({as:c,className:(0,r.c)(v.root,n),ownerState:h,ref:a},o))}))},43692:(e,a,s)=>{s.d(a,{c:()=>p});var l=s(45072),t=s(95656),n=s(69060),r=s(79736),i=s(21412),c=s(12556),d=s(49836),o=s(85624),h=s(10099),m=s(33448);function x(e){return(0,m.cp)("MuiCard",e)}(0,h.c)("MuiCard",["root"]);var u=s(82496);const j=["className","raised"],v=(0,c.cp)(o.c,{name:"MuiCard",slot:"Root",overridesResolver:(e,a)=>a.root})((()=>({overflow:"hidden"}))),p=n.forwardRef((function(e,a){const s=(0,d.C)({props:e,name:"MuiCard"}),{className:n,raised:c=!1}=s,o=(0,t.c)(s,j),h=(0,l.c)({},s,{raised:c}),m=(e=>{const{classes:a}=e;return(0,i.c)({root:["root"]},x,a)})(h);return(0,u.jsx)(v,(0,l.c)({className:(0,r.c)(m.root,n),elevation:c?8:void 0,ref:a,ownerState:h},o))}))}}]);
//# sourceMappingURL=6060.38d6a9b6.chunk.js.map