"use strict";(self.webpackChunkerp=self.webpackChunkerp||[]).push([[3416],{13724:(e,l,i)=>{i.d(l,{c:()=>C});var n=i(69060),s=i(27454),d=i(700),a=i(5548),r=i(99904),t=i(85624),o=i(33856),u=i(58612),c=i(53248),v=i(29504),m=i(5930),x=i(39308),p=i(41459),h=i(46864),b=i(82496);const g=e=>{let{dataArray:l=[],columns:i=[],onClickFun:g=null,isExpendable:C=!1,expandableComp:j=null,tableMaxHeight:_=550,initialPageCount:N=20,EnableSerialNumber:S=!1,CellSize:y="small",disablePagination:f=!1,title:w=""}=e;const[F,D]=(0,n.useState)(0),[M,A]=(0,n.useState)(N),[H,z]=(0,n.useState)([]),V=[{type:"left",class:"text-start"},{type:"right",class:"text-end"},{type:"center",class:"text-center"}],k=(e=>{if(!H.length)return e;return[...e].sort(((e,l)=>{for(const i of H){const{columnId:n,direction:s}=i,d=e[n],a=l[n];if(d!==a)return"asc"===s?d>a?1:-1:d<a?1:-1}return 0}))})(l),R=F*M,P=R+M,I=k.slice(R,P),E=(e,l)=>{switch(l){case"number":return(0,x.SA)(e);case"date":return(0,x.uy)(e);case"time":return(0,x.AX)(e);case"string":return e;default:return""}},L=e=>{let{row:l,index:r}=e;const[t,o]=(0,n.useState)(!1),u="20px";return(0,b.jsxs)(n.Fragment,{children:[(0,b.jsxs)(s.c,{children:[!0===C&&j&&(0,b.jsx)(d.c,{className:"fa-13 border-end text-center",children:(0,b.jsx)(a.c,{size:"small",onClick:()=>o((e=>!e)),children:t?(0,b.jsx)(p.c,{sx:{fontSize:u}}):(0,b.jsx)(h.c,{sx:{fontSize:u}})})}),!0===S&&(0,b.jsx)(d.c,{className:"fa-13 border-end text-center",children:M*F+r+1}),null===i||void 0===i?void 0:i.map(((e,i)=>{var n;return((0,x.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,x.Qr)(null===e||void 0===e?void 0:e.isVisible,1))&&(!1!==Boolean(null===e||void 0===e?void 0:e.isCustomCell)&&e.Cell?(0,b.jsx)(d.c,{className:"fa-13 border-end "+(e.align?null===(n=V.find((l=>l.type===String(e.align).toLowerCase())))||void 0===n?void 0:n.class:""),children:e.Cell({row:l,Field_Name:e.Field_Name})},i):Object.entries(l).map((n=>{var s;let[a,r]=n;return e.Field_Name===a&&((0,x.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,x.Qr)(null===e||void 0===e?void 0:e.isVisible,1))&&(0,b.jsx)(d.c,{className:"fa-13 border-end "+(e.align?null===(s=V.find((l=>l.type===String(e.align).toLowerCase())))||void 0===s?void 0:s.class:""),onClick:()=>g?g(l):console.log("Function not supplied"),children:E(r,null===e||void 0===e?void 0:e.Fied_Data)},i)})))}))]}),!0===C&&j&&t&&(0,b.jsx)(s.c,{children:(0,b.jsx)(d.c,{colSpan:Number(null===i||void 0===i?void 0:i.length)+(!0===S?2:1),children:j({row:l,index:r})})})]})};return(0,b.jsxs)("div",{children:[w&&(0,b.jsx)("h6",{className:"fw-bold text-muted",children:w}),(0,b.jsx)(r.c,{component:t.c,sx:{maxHeight:_},children:(0,b.jsxs)(o.c,{stickyHeader:!0,size:y,children:[(0,b.jsx)(u.c,{children:(0,b.jsxs)(s.c,{children:[C&&j&&(0,b.jsx)(d.c,{className:"fa-13 fw-bold border-end border-top text-center",style:{backgroundColor:"#EDF0F7"},children:"#"}),S&&(0,b.jsx)(d.c,{className:"fa-13 fw-bold border-end border-top text-center",style:{backgroundColor:"#EDF0F7"},children:"SNo"}),i.map(((e,l)=>{const i=(0,x.Qr)(null===e||void 0===e?void 0:e.Defult_Display,1)||(0,x.Qr)(null===e||void 0===e?void 0:e.isVisible,1),n=!1===Boolean(null===e||void 0===e?void 0:e.isCustomCell)||!e.Cell,s=H.find((l=>l.columnId===e.Field_Name)),a=s?s.direction:"asc";var r,t,o,u;return i?n?(0,b.jsx)(d.c,{className:"fa-13 fw-bold border-end border-top "+(e.align?null===(r=V.find((l=>l.type===String(e.align).toLowerCase())))||void 0===r?void 0:r.class:""),style:{backgroundColor:"#EDF0F7"},sortDirection:!!s&&a,children:(0,b.jsx)(c.c,{active:!!s,direction:a,onClick:()=>(e=>{const l=H.find((l=>l.columnId===e));if(l){const i="asc"===l.direction;z(H.map((l=>l.columnId===e?{...l,direction:i?"desc":"asc"}:l)))}else z([...H,{columnId:e,direction:"asc"}])})(e.Field_Name),children:e.ColumnHeader||(null===e||void 0===e||null===(t=e.Field_Name)||void 0===t?void 0:t.replace(/_/g," "))})},l):(0,b.jsx)(d.c,{className:"".concat(e.ColumnHeader||null!==e&&void 0!==e&&e.Field_Name?" fa-13 fw-bold border-end border-top p-2 appFont ":" p-0 "," ")+(e.align?null===(o=V.find((l=>l.type===String(e.align).toLowerCase())))||void 0===o?void 0:o.class:""),style:{backgroundColor:"#EDF0F7"},children:e.ColumnHeader||(null===e||void 0===e||null===(u=e.Field_Name)||void 0===u?void 0:u.replace(/_/g," "))},l):null}))]})}),(0,b.jsxs)(v.c,{children:[(f?k:I).map(((e,l)=>(0,b.jsx)(L,{row:e,index:l},l))),0===l.length&&(0,b.jsx)(s.c,{children:(0,b.jsx)(d.c,{colSpan:i.length+(!0===C&&j?1:0)+(!0===S?1:0),sx:{textAlign:"center"},children:"No Data"})})]})]})}),!f&&0!==I.length&&(0,b.jsx)("div",{className:"p-2 pb-0",children:(0,b.jsx)(m.c,{component:"div",count:l.length,page:F,onPageChange:(e,l)=>{D(l)},rowsPerPage:M,onRowsPerPageChange:e=>{A(parseInt(e.target.value,10)),D(0)},rowsPerPageOptions:Array.from(new Set([N,5,20,50,100,200,500])).sort(((e,l)=>e-l)),labelRowsPerPage:"Rows per page",showFirstButton:!0,showLastButton:!0})})]})};g.defaultProps={dataArray:[],columns:[],onClickFun:null,isExpendable:!1,expandableComp:null,tableMaxHeight:550,initialPageCount:20,EnableSerialNumber:!1,CellSize:"small",disablePagination:!1,title:void 0};const C=g},64568:(e,l,i)=>{i.d(l,{c:()=>s});var n=i(82496);const s=()=>(0,n.jsx)("span",{style:{color:"red",fontWeight:"bold",fontSize:"1em"},children:" *"})},33416:(e,l,i)=>{i.r(l),i.d(l,{default:()=>j});var n=i(69060),s=i(1908),d=i(39308),a=i(3358),r=i(89e3),t=i(5548),o=i(82656),u=i(26773),c=i(4488),v=i(90048),m=i(96064),x=i(86e3),p=i(56480),h=i(13724),b=i(64568),g=i(82496);const C={id:"",name:"",menu_type:1,parent_id:"",url:"",display_order:1,is_active:1,parantDetails:{}},j=e=>{var l;let{loadingOn:i,loadingOff:j}=e;const[_,N]=(0,n.useState)(C),[S,y]=(0,n.useState)(!1),[f,w]=(0,n.useState)([]),[F,D]=(0,n.useState)(!1);(0,n.useEffect)((()=>{(0,s.q)({address:"authorization/menuMaster"}).then((e=>{e.success&&w(e.data)})).catch((e=>console.error(e)))}),[S]);const M=e=>{var l;let{dataSource:i}=e;return(0,g.jsx)(h.c,{dataArray:null!==(l=null===i||void 0===i?void 0:i.SubRoutes)&&void 0!==l?l:[],title:"Sub Routes",columns:[{isVisible:1,Field_Name:"name",Fied_Data:"string",ColumnHeader:"Menu"},{isVisible:1,Field_Name:"url",Fied_Data:"string",ColumnHeader:"Address"},{isVisible:1,isCustomCell:!0,Cell:e=>{var l,i;let{row:n}=e;return(0,g.jsx)(a.c,{title:"Add SubRouting",children:(0,g.jsx)("span",{children:(0,g.jsx)(r.c,{size:"small",className:"bg-light",onClick:()=>{N((e=>{var l;return{...e,menu_type:0,parent_id:n.id,parantDetails:n,url:(null!==(l=null===n||void 0===n?void 0:n.url)&&void 0!==l?l:"")+"/"}})),D(!0)},startIcon:(0,g.jsx)(m.c,{sx:{fontSize:"18px"}}),children:null!==(l=null===n||void 0===n||null===(i=n.SubRoutes)||void 0===i?void 0:i.length)&&void 0!==l?l:0})})})},ColumnHeader:"Sub Routings"},{isVisible:1,Field_Name:"display_order",Fied_Data:"number",ColumnHeader:"Order"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,d.Qr)(null===l||void 0===l?void 0:l.is_active,1)?(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-success",children:"Active"}):(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-danger",children:"In-Active"})},ColumnHeader:"Status"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,g.jsx)(g.Fragment,{children:(0,g.jsx)(a.c,{title:"Edit Menu",children:(0,g.jsx)(t.c,{size:"small",className:"p-1",onClick:()=>{N((e=>{var i,n,s,d,a;return{...e,id:null===l||void 0===l?void 0:l.id,name:null!==(i=null===l||void 0===l?void 0:l.name)&&void 0!==i?i:"",menu_type:0,parent_id:null!==(n=null===l||void 0===l?void 0:l.parent_id)&&void 0!==n?n:"",url:null!==(s=null===l||void 0===l?void 0:l.url)&&void 0!==s?s:"",display_order:null!==(d=null===l||void 0===l?void 0:l.display_order)&&void 0!==d?d:"",is_active:null!==(a=null===l||void 0===l?void 0:l.is_active)&&void 0!==a?a:""}})),D(!0)},children:(0,g.jsx)(x.c,{sx:{fontSize:"18px"}})})})})},ColumnHeader:"Action"}],tableMaxHeight:700,isExpendable:!0,expandableComp:e=>{var l;let{row:i}=e;return(null===i||void 0===i||null===(l=i.SubRoutes)||void 0===l?void 0:l.length)>0&&(0,g.jsx)(M,{dataSource:i})}})},A=e=>{var l,i;let{row:n}=e;return(0,g.jsxs)(g.Fragment,{children:[(null===n||void 0===n||null===(l=n.ChildMenu)||void 0===l?void 0:l.length)>0&&(0,g.jsx)(h.c,{dataArray:null!==(i=null===n||void 0===n?void 0:n.ChildMenu)&&void 0!==i?i:[],title:"Child Menus",columns:[{isVisible:1,Field_Name:"name",Fied_Data:"string",ColumnHeader:"Child Menu"},{isVisible:1,Field_Name:"url",Fied_Data:"string",ColumnHeader:"Address"},{isVisible:1,isCustomCell:!0,Cell:e=>{var l,i;let{row:n}=e;return(0,g.jsx)(a.c,{title:"Add SubRouting",children:(0,g.jsx)("span",{children:(0,g.jsx)(r.c,{size:"small",className:"bg-light",onClick:()=>{N((e=>{var l,i,s;return{...e,menu_type:0,parent_id:n.id,parantDetails:n,url:(null!==n&&void 0!==n&&null!==(l=n.ParantData)&&void 0!==l&&l.url?(null===n||void 0===n||null===(i=n.ParantData)||void 0===i?void 0:i.url)+"/":"")+(null!==(s=null===n||void 0===n?void 0:n.url)&&void 0!==s?s:"")+"/"}})),D(!0)},startIcon:(0,g.jsx)(m.c,{sx:{fontSize:"18px"}}),children:null!==(l=null===n||void 0===n||null===(i=n.SubRoutes)||void 0===i?void 0:i.length)&&void 0!==l?l:0})})})},ColumnHeader:"Sub Routings"},{isVisible:1,Field_Name:"display_order",Fied_Data:"number",ColumnHeader:"Order"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,d.Qr)(null===l||void 0===l?void 0:l.is_active,1)?(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-success",children:"Active"}):(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-danger",children:"In-Active"})},ColumnHeader:"Status"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,g.jsx)(g.Fragment,{children:(0,g.jsx)(a.c,{title:"Edit Menu",children:(0,g.jsx)(t.c,{size:"small",className:"p-1",onClick:()=>{N((e=>{var i,n,s,d,a;return{...e,id:null===l||void 0===l?void 0:l.id,name:null!==(i=null===l||void 0===l?void 0:l.name)&&void 0!==i?i:"",menu_type:3,parent_id:null!==(n=null===l||void 0===l?void 0:l.parent_id)&&void 0!==n?n:"",url:null!==(s=null===l||void 0===l?void 0:l.url)&&void 0!==s?s:"",display_order:null!==(d=null===l||void 0===l?void 0:l.display_order)&&void 0!==d?d:"",is_active:null!==(a=null===l||void 0===l?void 0:l.is_active)&&void 0!==a?a:""}})),D(!0)},children:(0,g.jsx)(x.c,{sx:{fontSize:"18px"}})})})})},ColumnHeader:"Action"}]}),n.SubRoutes.length>0&&(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)("br",{}),(0,g.jsx)(M,{dataSource:n})]})]})},H=e=>{var l;let{row:i}=e;return(0,g.jsxs)(g.Fragment,{children:[i.SubMenu.length>0&&(0,g.jsx)(h.c,{dataArray:null!==(l=null===i||void 0===i?void 0:i.SubMenu)&&void 0!==l?l:[],title:"Sub Menus",columns:[{isVisible:1,Field_Name:"name",Fied_Data:"string",ColumnHeader:"Sub Menu"},{isVisible:1,Field_Name:"url",Fied_Data:"string",ColumnHeader:"Address"},{isVisible:1,isCustomCell:!0,Cell:e=>{var l,i;let{row:n}=e;return(0,g.jsx)(a.c,{title:"Add Child-Menu",children:(0,g.jsx)("span",{children:(0,g.jsx)(r.c,{size:"small",className:"bg-light",onClick:()=>{N((e=>{var l,i,s;return{...e,menu_type:3,parent_id:n.id,parantDetails:n,url:(null!==n&&void 0!==n&&null!==(l=n.ParantData)&&void 0!==l&&l.url?(null===n||void 0===n||null===(i=n.ParantData)||void 0===i?void 0:i.url)+"/":"")+(null!==(s=null===n||void 0===n?void 0:n.url)&&void 0!==s?s:"")+"/"}})),D(!0)},startIcon:(0,g.jsx)(m.c,{sx:{fontSize:"18px"}}),children:null!==(l=null===n||void 0===n||null===(i=n.ChildMenu)||void 0===i?void 0:i.length)&&void 0!==l?l:0})})})},ColumnHeader:"Child Menu"},{isVisible:1,isCustomCell:!0,Cell:e=>{var l,i;let{row:n}=e;return(0,g.jsx)(a.c,{title:"Add SubRouting",children:(0,g.jsx)("span",{children:(0,g.jsx)(r.c,{size:"small",className:"bg-light",onClick:()=>{N((e=>{var l,i,s;return{...e,menu_type:0,parent_id:n.id,parantDetails:n,url:(null!==n&&void 0!==n&&null!==(l=n.ParantData)&&void 0!==l&&l.url?(null===n||void 0===n||null===(i=n.ParantData)||void 0===i?void 0:i.url)+"/":"")+(null!==(s=null===n||void 0===n?void 0:n.url)&&void 0!==s?s:"")+"/"}})),D(!0)},startIcon:(0,g.jsx)(m.c,{sx:{fontSize:"18px"}}),children:null!==(l=null===n||void 0===n||null===(i=n.SubRoutes)||void 0===i?void 0:i.length)&&void 0!==l?l:0})})})},ColumnHeader:"Sub Routings"},{isVisible:1,Field_Name:"display_order",Fied_Data:"number",ColumnHeader:"Order"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,d.Qr)(null===l||void 0===l?void 0:l.is_active,1)?(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-success",children:"Active"}):(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-danger",children:"In-Active"})},ColumnHeader:"Status"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,g.jsx)(g.Fragment,{children:(0,g.jsx)(a.c,{title:"Edit Menu",children:(0,g.jsx)(t.c,{size:"small",className:"p-1",onClick:()=>{N((e=>{var i,n,s,d,a;return{...e,id:null===l||void 0===l?void 0:l.id,name:null!==(i=null===l||void 0===l?void 0:l.name)&&void 0!==i?i:"",menu_type:2,parent_id:null!==(n=null===l||void 0===l?void 0:l.parent_id)&&void 0!==n?n:"",url:null!==(s=null===l||void 0===l?void 0:l.url)&&void 0!==s?s:"",display_order:null!==(d=null===l||void 0===l?void 0:l.display_order)&&void 0!==d?d:"",is_active:null!==(a=null===l||void 0===l?void 0:l.is_active)&&void 0!==a?a:""}})),D(!0)},children:(0,g.jsx)(x.c,{sx:{fontSize:"18px"}})})})})},ColumnHeader:"Action"}],tableMaxHeight:700,isExpendable:!0,expandableComp:e=>{var l,i;let{row:n}=e;return((null===n||void 0===n||null===(l=n.ChildMenu)||void 0===l?void 0:l.length)>0||(null===n||void 0===n||null===(i=n.SubRoutes)||void 0===i?void 0:i.length)>0)&&(0,g.jsx)(A,{row:n})}}),i.SubRoutes.length>0&&(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)("br",{}),(0,g.jsx)(M,{dataSource:i})]})]})},z=()=>{D(!1),N(C)};return(0,g.jsxs)(g.Fragment,{children:[(0,g.jsx)("div",{className:"d-flex justify-content-end pb-2",children:(0,g.jsx)(r.c,{onClick:()=>{D(!0),N(C)},variant:"outlined",startIcon:(0,g.jsx)(m.c,{}),children:"New Menu"})}),(0,g.jsx)(h.c,{dataArray:f,columns:[{isVisible:1,Field_Name:"name",Fied_Data:"string",ColumnHeader:"Main Menu"},{isVisible:1,Field_Name:"url",Fied_Data:"string",ColumnHeader:"Address"},{isVisible:1,isCustomCell:!0,Cell:e=>{var l,i;let{row:n}=e;return(0,g.jsx)(a.c,{title:"Add Sub-Menu",children:(0,g.jsx)("span",{children:(0,g.jsx)(r.c,{size:"small",className:"bg-light",onClick:()=>{N((e=>{var l;return{...e,menu_type:2,parent_id:n.id,parantDetails:n,url:(null!==(l=null===n||void 0===n?void 0:n.url)&&void 0!==l?l:"")+"/"}})),D(!0)},startIcon:(0,g.jsx)(m.c,{sx:{fontSize:"18px"}}),children:null!==(l=null===n||void 0===n||null===(i=n.SubMenu)||void 0===i?void 0:i.length)&&void 0!==l?l:0})})})},ColumnHeader:"Sub Menu",align:"center"},{isVisible:1,isCustomCell:!0,Cell:e=>{var l,i;let{row:n}=e;return(0,g.jsx)(a.c,{title:"Add SubRouting",children:(0,g.jsx)("span",{children:(0,g.jsx)(r.c,{size:"small",className:"bg-light",onClick:()=>{N((e=>{var l;return{...e,menu_type:0,parent_id:n.id,parantDetails:n,url:(null!==(l=null===n||void 0===n?void 0:n.url)&&void 0!==l?l:"")+"/"}})),D(!0)},startIcon:(0,g.jsx)(m.c,{sx:{fontSize:"18px"}}),children:null!==(l=null===n||void 0===n||null===(i=n.SubRoutes)||void 0===i?void 0:i.length)&&void 0!==l?l:0})})})},ColumnHeader:"Sub Routings",align:"center"},{isVisible:1,Field_Name:"display_order",Fied_Data:"number",ColumnHeader:"Order"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,d.Qr)(null===l||void 0===l?void 0:l.is_active,1)?(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-success",children:"Active"}):(0,g.jsx)("span",{className:"px-3 py-1 rounded-3 text-white bg-danger",children:"In-Active"})},ColumnHeader:"Status"},{isVisible:1,isCustomCell:!0,Cell:e=>{let{row:l}=e;return(0,g.jsx)(g.Fragment,{children:(0,g.jsx)(a.c,{title:"Edit Menu",children:(0,g.jsx)(t.c,{size:"small",className:"p-1",onClick:()=>{N((e=>{var i,n,s,d,a;return{...e,id:null===l||void 0===l?void 0:l.id,name:null!==(i=null===l||void 0===l?void 0:l.name)&&void 0!==i?i:"",menu_type:1,parent_id:null!==(n=null===l||void 0===l?void 0:l.parent_id)&&void 0!==n?n:"",url:null!==(s=null===l||void 0===l?void 0:l.url)&&void 0!==s?s:"",display_order:null!==(d=null===l||void 0===l?void 0:l.display_order)&&void 0!==d?d:"",is_active:null!==(a=null===l||void 0===l?void 0:l.is_active)&&void 0!==a?a:""}})),D(!0)},children:(0,g.jsx)(x.c,{sx:{fontSize:"18px"}})})})})},ColumnHeader:"Action"}],tableMaxHeight:700,isExpendable:!0,expandableComp:e=>{var l,i;let{row:n}=e;return((null===n||void 0===n||null===(l=n.SubMenu)||void 0===l?void 0:l.length)>0||(null===n||void 0===n||null===(i=n.SubRoutes)||void 0===i?void 0:i.length)>0)&&(0,g.jsx)(H,{row:n})}}),(0,g.jsxs)(o.c,{open:F,onClose:z,maxWidth:"sm",fullWidth:!0,children:[(0,g.jsxs)(u.c,{children:[_.id?"Modify ":"Add ",(()=>{switch(_.menu_type){case 0:return"SUB ROUTING";case 1:return"MAIN MENU";case 2:return"SUB MENU";case 3:return"CHILD MENU";default:return""}})()]}),(0,g.jsxs)("form",{onSubmit:e=>{e.preventDefault(),i&&i(),(0,s.q)({address:"authorization/menuMaster",method:_.id?"PUT":"POST",bodyData:_}).then((e=>{e.success?(p.m4.success(e.message),z(),y((e=>!e))):p.m4.error(e.message)})).catch((e=>console.error(e))).finally((()=>{j&&j()}))},children:[(0,g.jsx)(c.c,{children:(0,g.jsxs)("div",{className:"row",children:[(0,d.CY)(_.parantDetails)&&_.parantDetails.name&&(0,g.jsxs)("div",{className:"col-lg-12 p-2",children:[(0,g.jsx)("label",{children:"Parant Name "}),(0,g.jsx)("input",{className:"cus-inpt",value:null===_||void 0===_||null===(l=_.parantDetails)||void 0===l?void 0:l.name,disabled:!0})]}),(0,g.jsxs)("div",{className:"col-lg-6 p-2",children:[(0,g.jsxs)("label",{children:["Name ",(0,g.jsx)(b.c,{})]}),(0,g.jsx)("input",{className:"cus-inpt",value:_.name,onChange:e=>N((l=>({...l,name:e.target.value}))),required:!0,minLength:3,maxLength:20})]}),(0,g.jsxs)("div",{className:"col-lg-6 p-2",children:[(0,g.jsx)("label",{children:"Order No"}),(0,g.jsx)("input",{className:"cus-inpt",value:_.display_order,onChange:e=>N((l=>({...l,display_order:e.target.value})))})]}),(0,g.jsxs)("div",{className:"col-lg-12 p-2",children:[(0,g.jsx)("label",{children:"URL (Link)"}),(0,g.jsx)("input",{className:"cus-inpt",value:_.url,onChange:e=>N((l=>({...l,url:e.target.value})))})]}),_.id&&(0,g.jsxs)("div",{className:"col-lg-6 p-2",children:[(0,g.jsx)("label",{children:"Is Active"}),(0,g.jsxs)("select",{className:"cus-inpt",value:_.is_active,onChange:e=>N((l=>({...l,is_active:e.target.value}))),children:[(0,g.jsx)("option",{value:"",disabled:!0,children:"select"}),(0,g.jsx)("option",{value:"1",children:"Active"}),(0,g.jsx)("option",{value:"0",children:"In-Active"})]})]})]})}),(0,g.jsxs)(v.c,{children:[(0,g.jsx)(r.c,{type:"button",onClick:z,children:"cancel"}),(0,g.jsx)(r.c,{type:"submit",variant:"outlined",children:"save"})]})]})]})]})}},96064:(e,l,i)=>{i.d(l,{c:()=>d});var n=i(27664),s=i(82496);const d=(0,n.c)((0,s.jsx)("path",{d:"M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"}),"Add")},86e3:(e,l,i)=>{i.d(l,{c:()=>d});var n=i(27664),s=i(82496);const d=(0,n.c)((0,s.jsx)("path",{d:"M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"}),"Edit")}}]);
//# sourceMappingURL=3416.bb5b8cb3.chunk.js.map