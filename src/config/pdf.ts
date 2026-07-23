// PDF配置文件
export const PDF_CONFIG = {
  // 原始PDF文件路径（相对于public目录）
  originalFilePath: '/pdfs/impa_8th_2023.pdf',
  
  // 精确的PDF文件配置 - 按章节号排序（00/10、11 在前；默认落地页与下拉顺序符合直觉）
  // 注意：绝对页码仍以 startPage/endPage 为准；跨章翻页用 min/max(start/end)，勿依赖本数组下标当页范围
  sections: [
    {
      name: '00_10-Provisions_Slop_Chest',
      title: '00 & 10, Provisions & Slop Chest',
      filePath: '/pdfs/sections/00_10-Provisions_Slop_Chest.pdf',
      description: '食品和服装柜',
      category: '生活用品',
      startPage: 1381,
      endPage: 1406,
      size: '9.5MB'
    },
    {
      name: '11-Welware_Items',
      title: '11, Welware Items',
      filePath: '/pdfs/sections/11-Welware_Items.pdf',
      description: '焊接用品',
      category: '焊接设备',
      startPage: 1368,
      endPage: 1380,
      size: '3.8MB'
    },
    {
      name: '15-Cloth_Linen_Products',
      title: '15, Cloth & Linen Products',
      filePath: '/pdfs/sections/15-Cloth_Linen_Products.pdf',
      description: '布料和亚麻制品',
      category: '生活用品',
      startPage: 39,
      endPage: 48,
      size: '3.1MB'
    },
    {
      name: '17-Tableware_Galley_Utensils',
      title: '17, Tableware & Galley Utensils',
      filePath: '/pdfs/sections/17-Tableware_Galley_Utensils.pdf',
      description: '餐具和厨房用具',
      category: '厨房用品',
      startPage: 49,
      endPage: 118,
      size: '21.5MB'
    },
    {
      name: '19-Clothing',
      title: '19, Clothing',
      filePath: '/pdfs/sections/19-Clothing.pdf',
      description: '服装',
      category: '生活用品',
      startPage: 119,
      endPage: 131,
      size: '3.6MB'
    },
    {
      name: '21-Rope_Hawsers',
      title: '21, Rope & Hawsers',
      filePath: '/pdfs/sections/21-Rope_Hawsers.pdf',
      description: '绳索和缆绳',
      category: '甲板设备',
      startPage: 132,
      endPage: 178,
      size: '15.7MB'
    },
    {
      name: '23-Rigging_Equipment_General_Deck_Items',
      title: '23, Rigging Equipment & General Deck Items',
      filePath: '/pdfs/sections/23-Rigging_Equipment_General_Deck_Items.pdf',
      description: '索具设备和一般甲板用品',
      category: '甲板设备',
      startPage: 179,
      endPage: 244,
      size: '20.8MB'
    },
    {
      name: '25-Marine_Paint',
      title: '25, Marine Paint',
      filePath: '/pdfs/sections/25-Marine_Paint.pdf',
      description: '船舶涂料',
      category: '涂装材料',
      startPage: 245,
      endPage: 260,
      size: '4.7MB'
    },
    {
      name: '27-Painting_Equipment',
      title: '27, Painting Equipment',
      filePath: '/pdfs/sections/27-Painting_Equipment.pdf',
      description: '涂装设备',
      category: '涂装材料',
      startPage: 261,
      endPage: 273,
      size: '3.8MB'
    },
    {
      name: '31-Safety_Protective_Gear',
      title: '31, Safety Protective Gear',
      filePath: '/pdfs/sections/31-Safety_Protective_Gear.pdf',
      description: '安全防护装备',
      category: '安全设备',
      startPage: 274,
      endPage: 298,
      size: '8.7MB'
    },
    {
      name: '33-Safety_Equipment_part1',
      title: '33, Safety Equipment (Part 1)',
      filePath: '/pdfs/sections/33-Safety_Equipment_part1.pdf',
      description: '安全设备（第一部分）',
      category: '安全设备',
      startPage: 299,
      endPage: 356,
      size: '17.5MB'
    },
    {
      name: '33-Safety_Equipment_part2',
      title: '33, Safety Equipment (Part 2)',
      filePath: '/pdfs/sections/33-Safety_Equipment_part2.pdf',
      description: '安全设备（第二部分）',
      category: '安全设备',
      startPage: 357,
      endPage: 415,
      size: '17.5MB'
    },
    {
      name: '35-Hose_Couplings',
      title: '35, Hose & Couplings',
      filePath: '/pdfs/sections/35-Hose_Couplings.pdf',
      description: '软管和接头',
      category: '管道系统',
      startPage: 416,
      endPage: 438,
      size: '6.7MB'
    },
    {
      name: '37-Nautical_Equipment',
      title: '37, Nautical Equipment',
      filePath: '/pdfs/sections/37-Nautical_Equipment.pdf',
      description: '航海设备',
      category: '导航设备',
      startPage: 439,
      endPage: 485,
      size: '15.3MB'
    },
    {
      name: '39-Medicine',
      title: '39, Medicine',
      filePath: '/pdfs/sections/39-Medicine.pdf',
      description: '药品',
      category: '医疗用品',
      startPage: 486,
      endPage: 526,
      size: '12.3MB'
    },
    {
      name: '45-Petroleum_Products',
      title: '45, Petroleum Products',
      filePath: '/pdfs/sections/45-Petroleum_Products.pdf',
      description: '石油产品',
      category: '化工产品',
      startPage: 527,
      endPage: 545,
      size: '6.2MB'
    },
    {
      name: '47-Stationery',
      title: '47, Stationery',
      filePath: '/pdfs/sections/47-Stationery.pdf',
      description: '文具用品',
      category: '办公用品',
      startPage: 546,
      endPage: 574,
      size: '8.4MB'
    },
    {
      name: '49-Hardware',
      title: '49, Hardware',
      filePath: '/pdfs/sections/49-Hardware.pdf',
      description: '五金件',
      category: '五金配件',
      startPage: 575,
      endPage: 601,
      size: '6.9MB'
    },
    {
      name: '51-Brushes_Mats',
      title: '51, Brushes & Mats',
      filePath: '/pdfs/sections/51-Brushes_Mats.pdf',
      description: '刷子和垫子',
      category: '清洁用品',
      startPage: 602,
      endPage: 615,
      size: '3.9MB'
    },
    {
      name: '53-Lavatory_Equipment',
      title: '53, Lavatory Equipment',
      filePath: '/pdfs/sections/53-Lavatory_Equipment.pdf',
      description: '盥洗设备',
      category: '生活设施',
      startPage: 616,
      endPage: 629,
      size: '3.5MB'
    },
    {
      name: '55-Cleaning_Material_Chemicals',
      title: '55, Cleaning Material & Chemicals',
      filePath: '/pdfs/sections/55-Cleaning_Material_Chemicals.pdf',
      description: '清洁材料和化学品',
      category: '清洁用品',
      startPage: 630,
      endPage: 664,
      size: '10.3MB'
    },
    {
      name: '59-Pneumatic_Electrical_Tools_part1',
      title: '59, Pneumatic & Electrical Tools (Part 1)',
      filePath: '/pdfs/sections/59-Pneumatic_Electrical_Tools_part1.pdf',
      description: '气动和电动工具（第一部分）',
      category: '工具设备',
      startPage: 665,
      endPage: 709,
      size: '14.2MB'
    },
    {
      name: '59-Pneumatic_Electrical_Tools_part2',
      title: '59, Pneumatic & Electrical Tools (Part 2)',
      filePath: '/pdfs/sections/59-Pneumatic_Electrical_Tools_part2.pdf',
      description: '气动和电动工具（第二部分）',
      category: '工具设备',
      startPage: 710,
      endPage: 755,
      size: '14.1MB'
    },
    {
      name: '61-Hand_Tools_part1',
      title: '61, Hand Tools (Part 1)',
      filePath: '/pdfs/sections/61-Hand_Tools_part1.pdf',
      description: '手工工具（第一部分）',
      category: '工具设备',
      startPage: 756,
      endPage: 808,
      size: '15.2MB'
    },
    {
      name: '61-Hand_Tools_part2',
      title: '61, Hand Tools (Part 2)',
      filePath: '/pdfs/sections/61-Hand_Tools_part2.pdf',
      description: '手工工具（第二部分）',
      category: '工具设备',
      startPage: 809,
      endPage: 861,
      size: '15.1MB'
    },
    {
      name: '63-Cutting_Tools',
      title: '63, Cutting Tools',
      filePath: '/pdfs/sections/63-Cutting_Tools.pdf',
      description: '切割工具',
      category: '工具设备',
      startPage: 862,
      endPage: 890,
      size: '7.7MB'
    },
    {
      name: '65-Measuring_Tools',
      title: '65, Measuring Tools',
      filePath: '/pdfs/sections/65-Measuring_Tools.pdf',
      description: '测量工具',
      category: '工具设备',
      startPage: 891,
      endPage: 946,
      size: '18.3MB'
    },
    {
      name: '67-Metal_Sheets_Bars',
      title: '67, Metal Sheets, Bars, etc.',
      filePath: '/pdfs/sections/67-Metal_Sheets_Bars.pdf',
      description: '金属板材、棒材等',
      category: '金属材料',
      startPage: 947,
      endPage: 967,
      size: '6.3MB'
    },
    {
      name: '69-Screws_Nuts',
      title: '69, Screws & Nuts',
      filePath: '/pdfs/sections/69-Screws_Nuts.pdf',
      description: '螺丝和螺母',
      category: '五金配件',
      startPage: 968,
      endPage: 995,
      size: '8.0MB'
    },
    {
      name: '71-Pipes_Tubes',
      title: '71, Pipes & Tubes',
      filePath: '/pdfs/sections/71-Pipes_Tubes.pdf',
      description: '管道和管材',
      category: '管道系统',
      startPage: 996,
      endPage: 1008,
      size: '3.5MB'
    },
    {
      name: '73-Pipe_Tube_Fittings',
      title: '73, Pipe & Tube Fittings',
      filePath: '/pdfs/sections/73-Pipe_Tube_Fittings.pdf',
      description: '管道和管材配件',
      category: '管道系统',
      startPage: 1009,
      endPage: 1045,
      size: '11.0MB'
    },
    {
      name: '75-Valves_Cocks_part1',
      title: '75, Valves & Cocks (Part 1)',
      filePath: '/pdfs/sections/75-Valves_Cocks_part1.pdf',
      description: '阀门和旋塞（第一部分）',
      category: '管道系统',
      startPage: 1046,
      endPage: 1103,
      size: '19.0MB'
    },
    {
      name: '75-Valves_Cocks_part2',
      title: '75, Valves & Cocks (Part 2)',
      filePath: '/pdfs/sections/75-Valves_Cocks_part2.pdf',
      description: '阀门和旋塞（第二部分）',
      category: '管道系统',
      startPage: 1104,
      endPage: 1162,
      size: '18.9MB'
    },
    {
      name: '77-Bearings',
      title: '77, Bearings',
      filePath: '/pdfs/sections/77-Bearings.pdf',
      description: '轴承',
      category: '机械配件',
      startPage: 1163,
      endPage: 1175,
      size: '4.3MB'
    },
    {
      name: '79-Electrical_Equipment_part1',
      title: '79, Electrical Equipment (Part 1)',
      filePath: '/pdfs/sections/79-Electrical_Equipment_part1.pdf',
      description: '电气设备（第一部分）',
      category: '电气系统',
      startPage: 1176,
      endPage: 1217,
      size: '13.0MB'
    },
    {
      name: '79-Electrical_Equipment_part2',
      title: '79, Electrical Equipment (Part 2)',
      filePath: '/pdfs/sections/79-Electrical_Equipment_part2.pdf',
      description: '电气设备（第二部分）',
      category: '电气系统',
      startPage: 1218,
      endPage: 1260,
      size: '12.9MB'
    },
    {
      name: '81-Packing_Jointing',
      title: '81, Packing Jointing',
      filePath: '/pdfs/sections/81-Packing_Jointing.pdf',
      description: '填料和密封',
      category: '密封材料',
      startPage: 1261,
      endPage: 1329,
      size: '22.5MB'
    },
    {
      name: '85-Welding_Equipment',
      title: '85, Welding Equipment',
      filePath: '/pdfs/sections/85-Welding_Equipment.pdf',
      description: '焊接设备',
      category: '焊接设备',
      startPage: 1330,
      endPage: 1355,
      size: '8.3MB'
    },
    {
      name: '87-Machinery_Equipment',
      title: '87, Machinery Equipment',
      filePath: '/pdfs/sections/87-Machinery_Equipment.pdf',
      description: '机械设备',
      category: '机械设备',
      startPage: 1356,
      endPage: 1367,
      size: '3.8MB'
    }
  ],
  
  // PDF文件信息
  fileInfo: {
    name: 'IMPA Marine Stores Guide',
    edition: '8th Edition',
    year: '2023',
    originalSize: '494.1MB',
    totalPages: 1368, // 实际分割章节覆盖的页数 (39-1406)
    originalTotalPages: 1504, // 原始PDF总页数
    description: '国际海事采购协会海洋用品指南'
  },
  
  // 搜索配置
  searchConfig: {
    // 搜索结果上下文长度
    contextLength: 50,
    // 最大搜索结果数量
    maxResults: 100,
    // 是否启用高亮显示
    enableHighlight: true
  },
  
  // PDF.js配置
  pdfjsConfig: {
    // 渲染缩放比例
    scale: 1.5,
    // 是否启用文本选择
    enableTextSelection: true,
    // 是否启用打印
    enablePrint: true
  }
};

// 获取PDF文件的完整URL
export const getPDFUrl = (filePath: string): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin + filePath;
  }
  return filePath;
};

// 获取所有PDF章节的URL
export const getAllPDFUrls = (): string[] => {
  return PDF_CONFIG.sections.map(section => getPDFUrl(section.filePath));
};

// 检查PDF文件是否存在
export const checkPDFExists = async (filePath: string): Promise<boolean> => {
  try {
    const response = await fetch(filePath, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
};

// 检查所有PDF章节是否存在
export const checkAllPDFsExist = async (): Promise<boolean[]> => {
  const checks = PDF_CONFIG.sections.map(section => checkPDFExists(section.filePath));
  return Promise.all(checks);
};
