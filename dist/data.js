const avoidOptions=[
 {name:'太正式',hint:'成套西装、硬挺衬衫和商务皮鞋',image:'assets/style-work.jpg',credit:'August de Richelieu',sourceUrl:'https://www.pexels.com/photo/a-portrait-of-a-woman-in-a-business-attire-4428045/'},
 {name:'太松垮',hint:'上下都宽，轮廓没有重点',image:'assets/style-casual.jpg',credit:'Andrea Musto',sourceUrl:'https://www.pexels.com/photo/young-woman-posing-in-casual-summer-outfit-29061626/'},
 {name:'颜色太暗',hint:'大面积深色，整体明度太低',image:'assets/style-minimal.jpg',credit:'shawon Ahamed',sourceUrl:'https://www.pexels.com/photo/woman-wearing-black-tencel-shirt-dress-on-white-background-7322037/'},
 {name:'颜色太亮',hint:'高饱和撞色或醒目配饰',image:'assets/style-eclectic.jpg',credit:'O.L The Creator',sourceUrl:'https://www.pexels.com/photo/colorful-mixed-pattern-fashion-outfit-34169346/'},
 {name:'过于甜美',hint:'蝴蝶结、蕾丝等元素过多',image:'assets/style-romantic.jpg',credit:'WENCHENG JIANG',sourceUrl:'https://www.pexels.com/photo/woman-with-long-hair-in-a-dress-and-a-cardigan-13310288/'},
 {name:'装饰太多',hint:'图案、配饰和层次同时堆叠',image:'assets/style-vintage.jpg',credit:'Mert Coşkun',sourceUrl:'https://www.pexels.com/photo/young-woman-in-vintage-outfit-posing-outdoors-33271591/'},
 {name:'不想露肤',hint:'先在补充要求里说明具体部位',image:'assets/style-street.jpg',credit:'Aaronnicc',sourceUrl:'https://www.pexels.com/photo/young-woman-in-a-streetwear-style-outfit-posing-in-a-city-26604622/'},
 {name:'太运动',hint:'运动套装、球鞋和机能细节过多',image:'assets/style-sport.jpg',credit:"César O'neill",sourceUrl:'https://www.pexels.com/photo/young-woman-in-athletic-wear-on-tennis-court-33083401/'}
];
const SOURCE="https://www.whowhatwear.com/black-blazer-outfits";
const sceneOptions=[
 {
  "name": "日常通勤",
  "image": "assets/scene-work.jpg",
  "hint": "上班 · 办公",
  "credit": "Mikhail Nilov",
  "sourceUrl": "https://www.pexels.com/photo/woman-and-men-working-at-office-8102000/",
  "imageUrl": "https://images.pexels.com/photos/8102000/pexels-photo-8102000.jpeg?auto=compress&cs=tinysrgb&w=900"
 },
 {
  "name": "周末出门",
  "image": "assets/scene-weekend.jpg",
  "hint": "咖啡 · 逛街",
  "credit": "Amar Preciado",
  "sourceUrl": "https://www.pexels.com/photo/woman-enjoying-coffee-at-a-cozy-cafe-28793163/",
  "imageUrl": "https://images.pexels.com/photos/28793163/pexels-photo-28793163.jpeg?auto=compress&cs=tinysrgb&w=900"
 },
 {
  "name": "朋友聚会",
  "image": "assets/scene-friends.jpg",
  "hint": "聚餐 · 相聚",
  "credit": "Oktay Köseoğlu",
  "sourceUrl": "https://www.pexels.com/photo/group-of-friends-enjoying-tea-at-an-indoor-cafe-29804283/",
  "imageUrl": "https://images.pexels.com/photos/29804283/pexels-photo-29804283.jpeg?auto=compress&cs=tinysrgb&w=900"
 },
 {
  "name": "约会",
  "image": "assets/scene-date.jpg",
  "hint": "晚餐 · 散步",
  "credit": "Katerina Holmes",
  "sourceUrl": "https://www.pexels.com/photo/couple-enjoying-romantic-date-in-restaurant-5911145/",
  "imageUrl": "https://images.pexels.com/photos/5911145/pexels-photo-5911145.jpeg?auto=compress&cs=tinysrgb&w=900"
 },
 {
  "name": "旅行",
  "image": "assets/scene-travel.jpg",
  "hint": "出游 · 探索",
  "credit": "Rachel Claire",
  "sourceUrl": "https://www.pexels.com/photo/woman-with-a-backpack-walking-along-a-beach-6762136/",
  "imageUrl": "https://images.pexels.com/photos/6762136/pexels-photo-6762136.jpeg?auto=compress&cs=tinysrgb&w=900"
 },
 {
  "name": "看展",
  "image": "assets/scene-gallery.jpg",
  "hint": "艺术 · 展览",
  "credit": "Ahsen",
  "sourceUrl": "https://www.pexels.com/photo/people-inside-an-art-gallery-7763082/",
  "imageUrl": "https://images.pexels.com/photos/7763082/pexels-photo-7763082.jpeg?auto=compress&cs=tinysrgb&w=900"
 }
];
const styleOptions=[
 {name:'极简 Clean Fit',image:'assets/style-minimal.jpg',caption:'干净线条和低对比配色，重点放在比例与质感。',tags:['低饱和','简洁轮廓'],outfits:['denim','mono'],width:720,height:960,credit:'shawon Ahamed',sourceUrl:'https://www.pexels.com/photo/woman-wearing-black-tencel-shirt-dress-on-white-background-7322037/',imageUrl:'https://images.pexels.com/photos/7322037/pexels-photo-7322037.jpeg'},
 {name:'松弛休闲',image:'assets/style-casual.jpg',caption:'舒适基础款与自然比例，适合轻松的日常状态。',tags:['基础款','舒适'],outfits:['denim'],width:720,height:960,credit:'Andrea Musto',sourceUrl:'https://www.pexels.com/photo/young-woman-posing-in-casual-summer-outfit-29061626/',imageUrl:'https://images.pexels.com/photos/29061626/pexels-photo-29061626.jpeg'},
 {name:'通勤利落',image:'assets/style-work.jpg',caption:'清晰肩线和克制配色，保留专业感但不过度商务。',tags:['通勤','利落'],outfits:['mono'],width:720,height:960,credit:'August de Richelieu',sourceUrl:'https://www.pexels.com/photo/a-portrait-of-a-woman-in-a-business-attire-4428045/',imageUrl:'https://images.pexels.com/photos/4428045/pexels-photo-4428045.jpeg'},
 {name:'街头风',image:'assets/style-street.jpg',caption:'宽松层次与有态度的配饰，强调个人表达。',tags:['街头','层次'],outfits:['denim'],width:720,height:960,credit:'Aaronnicc',sourceUrl:'https://www.pexels.com/photo/young-woman-in-a-streetwear-style-outfit-posing-in-a-city-26604622/',imageUrl:'https://images.pexels.com/photos/26604622/pexels-photo-26604622.jpeg'},
 {name:'运动机能',image:'assets/style-sport.jpg',caption:'轻便、好活动，优先考虑运动感和实穿性。',tags:['运动','机能'],outfits:['denim'],width:720,height:960,credit:"César O'neill",sourceUrl:'https://www.pexels.com/photo/young-woman-in-athletic-wear-on-tennis-court-33083401/',imageUrl:'https://images.pexels.com/photos/33083401/pexels-photo-33083401.jpeg'},
 {name:'复古',image:'assets/style-vintage.jpg',caption:'用年代感廓形、色彩或配件营造怀旧气质。',tags:['复古','年代感'],outfits:['skirt'],width:720,height:960,credit:'Mert Coşkun',sourceUrl:'https://www.pexels.com/photo/young-woman-in-vintage-outfit-posing-outdoors-33271591/',imageUrl:'https://images.pexels.com/photos/33271591/pexels-photo-33271591.jpeg'},
 {name:'温柔浪漫',image:'assets/style-romantic.jpg',caption:'柔和色彩与轻盈线条，保留舒展而不过度甜美。',tags:['柔和','轻盈'],outfits:['skirt'],width:720,height:960,credit:'WENCHENG JIANG',sourceUrl:'https://www.pexels.com/photo/woman-with-long-hair-in-a-dress-and-a-cardigan-13310288/',imageUrl:'https://images.pexels.com/photos/13310288/pexels-photo-13310288.jpeg'},
 {name:'个性混搭',image:'assets/style-eclectic.jpg',caption:'图案、颜色和材质形成对比，让搭配更有记忆点。',tags:['撞色','混搭'],outfits:['mono','skirt'],width:720,height:960,credit:'O.L The Creator',sourceUrl:'https://www.pexels.com/photo/colorful-mixed-pattern-fashion-outfit-34169346/',imageUrl:'https://images.pexels.com/photos/34169346/pexels-photo-34169346.jpeg'}
];
const outfits=[
 {id:'denim',tag:'01 / EVERYDAY EASE',title:'把西装穿得松弛一点',subtitle:'黑色西装 × 蓝色牛仔',image:'assets/outfit-denim.jpg',credit:'@ada_oguntodu',style:'松弛休闲',reason:'用牛仔的随意感，平衡西装的正式感。熟悉的基础款，也能让闲置单品重新变顺眼。',difference:'参考图内搭露腰，并搭配花纹帽子。本方案改为常规长度内搭，省去帽子。',items:[{id:'top',name:'白色圆领 T 恤',role:'核心',tip:'常规长度、不透、领口平整。前摆轻收，露出一点腰线。',color:'#ebece4'},{id:'bottom',name:'蓝色直筒牛仔裤',role:'核心',tip:'中高腰、少破洞，裤脚落在鞋面附近。避免过长堆积。',color:'#698196'},{id:'shoes',name:'黑色乐福鞋',role:'核心',tip:'低跟、圆头或杏仁头。也可换干净的运动鞋。',color:'#292d28'},{id:'bag',name:'日常帆布包',role:'可选',tip:'不用专门买；已有的简洁包袋就可以。',color:'#c6bca6'}],keep:'保留「上身有结构、下身更放松」的对比；内搭干净，腰线不要完全被遮住。',avoid:'避免衬衫、成套西裤与正式皮鞋同时出现，以免又回到你不想要的商务感。'},
 {id:'mono',tag:'02 / CITY CONTRAST',title:'黑白之间，留一点轻盈',subtitle:'黑色西装 × 浅色阔腿裤',image:'assets/outfit-monochrome.jpg',credit:'@aemiliafay',style:'通勤利落',reason:'用大面积浅色提亮黑西装，减少沉闷。上下同色的内搭，让整体轮廓更干净。',difference:'参考图为九分白裤、Polo 领和踝靴，带红色包。本方案换圆领上衣、平底鞋，包袋可沿用。',items:[{id:'top',name:'米白色圆领上衣',role:'核心',tip:'轻薄但不透，和裤子保持相近明度。',color:'#eae6dc'},{id:'bottom',name:'米白色阔腿裤',role:'核心',tip:'面料有垂感，裤长不要拖地，腰臀留出活动余量。',color:'#deded2'},{id:'shoes',name:'简洁白色运动鞋',role:'核心',tip:'鞋型轻巧、配色简单，不需要厚重的鞋底。',color:'#f1f0e9'},{id:'bag',name:'小号黑色肩包',role:'可选',tip:'黑色呼应西装，也可以用已有的棕色包。',color:'#33352f'}],keep:'保留深色外套与浅色内搭的明度对比；上衣与裤子不必完全同色，但不要相差太多。',avoid:'避免全身黑色再叠加深色包鞋；也不必为了浅色搭配选择不透气或需要频繁整理的裤子。'},
 {id:'skirt',tag:'03 / SOFT BALANCE',title:'一点柔和，也很有主见',subtitle:'黑色西装 × 轻盈中长裙',image:'assets/outfit-skirt.jpg',credit:'@tamaramory',style:'温柔浪漫',reason:'让裙装的轻盈和西装的轮廓互相平衡，配上运动鞋，温柔也能穿得自在。',difference:'参考图西装带绒感、裙子有花纹。本方案用普通黑西装与低对比中长裙，减少图案。',items:[{id:'top',name:'白色基础 T 恤',role:'核心',tip:'纯色优先，减少大面积字母和图案。',color:'#f0efe8'},{id:'bottom',name:'低对比中长半裙',role:'核心',tip:'裙摆有活动空间，长度在小腿中下部，走路不受限制。',color:'#858b7e'},{id:'shoes',name:'轻便白色运动鞋',role:'核心',tip:'低帮更清爽，袜子与鞋或裙子颜色协调。',color:'#e9e9df'},{id:'bag',name:'柔软棕色小包',role:'可选',tip:'轮廓柔软即可，已有的中性色包袋都可尝试。',color:'#a5876b'}],keep:'保留「挺括外套＋有活动感的裙摆」；鞋子保持轻便，让搭配不会过于隆重。',avoid:'避免同时叠加蝴蝶结、蕾丝和细高跟。如果担心过于甜美，保留直线条的包和基础款内搭。'}
];
