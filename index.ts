import {
  Block,
  BlockType,
  RelationshipType,
  SelectionStatus,
} from '@aws-sdk/client-textract';

export interface FormConfig {
  trimChars?: string[];
}

export function createForm(
  data: { Blocks?: Block[] },
  config?: FormConfig
): Record<string, string> {
  if (!data.Blocks) return {};

  const { keyMap, valueMap, blockMap } = getKeyValueMap(data.Blocks);

  const trimChars = config?.trimChars;
  return getKeyValueRelationship(keyMap, valueMap, blockMap, trimChars);
}

export function createTables(
  data: { Blocks?: Block[] }
): Record<number, Record<number, string>>[] {
  const blocks = data.Blocks;
  if (!blocks) return [];

  const blocksMap: Record<string, Block> = {};
  const tableBlocks: Block[] = [];

  for (const block of blocks) {
    if (block.Id) {
      blocksMap[block.Id] = block;
    }
    if (block.BlockType === BlockType.TABLE) {
      tableBlocks.push(block);
    }
  }

  const tableSets: Record<number, Record<number, string>>[] = [];
  for (const table of tableBlocks) {
    tableSets.push(getRowsColumnsMap(table, blocksMap));
  }
  
  return tableSets;
}

function getKeyValueMap(blocks: Block[]) {
  const keyMap: Record<string, Block> = {};
  const valueMap: Record<string, Block> = {};
  const blockMap: Record<string, Block> = {};

  try {
    for (const block of blocks) {
      const blockId = block.Id;
      if (blockId) {
        blockMap[blockId] = block;
        if (block.BlockType === BlockType.KEY_VALUE_SET) {
          if (block.EntityTypes && block.EntityTypes.includes('KEY')) {
            keyMap[blockId] = block;
          } else {
            valueMap[blockId] = block;
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  
  return {
    keyMap,
    valueMap,
    blockMap,
  };
}

function getKeyValueRelationship(
  keyMap: Record<string, Block>,
  valueMap: Record<string, Block>,
  blockMap: Record<string, Block>,
  trimChars?: string[]
) {
  const kvs: Record<string, string> = {};
  try {
    for (const blockId in keyMap) {
      const keyBlock = keyMap[blockId];
      const valueBlock = findValueBlock(keyBlock, valueMap);

      let key = getText(keyBlock, blockMap);
      let val = getText(valueBlock, blockMap);

      if (trimChars && trimChars.length) {
        for (const char of trimChars) {
          const escapeChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^${escapeChar}+|${escapeChar}+$`, 'g');
          key = key.replace(regex, '');
          val = val.replace(regex, '');
        }
      }

      kvs[key.trim()] = val.trim();
    }
  } catch (err) {
    console.error(err);
  }
  
  return kvs;
}

function getText(result: Block | null, blocksMap: Record<string, Block>): string {
  let text = '';
  if (!result) return text;

  try {
    if (result.Relationships) {
      for (const relationship of result.Relationships) {
        if (relationship.Type === RelationshipType.CHILD && relationship.Ids) {
          for (const childId of relationship.Ids) {
            const word = blocksMap[childId];
            if (word.BlockType === BlockType.WORD && word.Text) {
              text += word.Text + ' ';
            }
            if (word.BlockType === BlockType.SELECTION_ELEMENT) {
              if (word.SelectionStatus === SelectionStatus.SELECTED) {
                text += 'X ';
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  
  return text;
}

function findValueBlock(keyBlock: Block, valueMap: Record<string, Block>): Block | null {
  let valueBlock: Block | null = null;
  try {
    if (keyBlock.Relationships) {
      for (const relationship of keyBlock.Relationships) {
        if (relationship.Type === RelationshipType.VALUE && relationship.Ids) {
          for (const valueId of relationship.Ids) {
            valueBlock = valueMap[valueId];
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  
  return valueBlock;
}

function getRowsColumnsMap(tableResult: Block, blocksMap: Record<string, Block>) {
  const rows: Record<number, Record<number, string>> = {};
  try {
    if (tableResult.Relationships) {
      for (const relationship of tableResult.Relationships) {
        if (relationship.Type === RelationshipType.CHILD && relationship.Ids) {
          for (const childId of relationship.Ids) {
            const cell = blocksMap[childId];
            if (cell.BlockType === BlockType.CELL && cell.RowIndex !== undefined && cell.ColumnIndex !== undefined) {
              const rowIndex = cell.RowIndex;
              const colIndex = cell.ColumnIndex;
              
              if (!rows[rowIndex]) {
                rows[rowIndex] = {};
              }
              rows[rowIndex][colIndex] = getText(cell, blocksMap).trim();
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  
  return rows;
}