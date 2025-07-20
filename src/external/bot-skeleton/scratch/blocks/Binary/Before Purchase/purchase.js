import { localize } from "@deriv-com/translations"
import { getContractTypeOptions } from "../../../shared"
import { excludeOptionFromContextMenu, modifyContextMenu } from "../../../utils"

window.Blockly.Blocks.purchase = {
  init() {
    this.jsonInit(this.definition())
    // Ensure one of this type per statement-stack
    this.setNextStatement(false)
  },
  definition() {
    return {
      // Consolidated message0 with all placeholders
      message0: localize("Purchase %1 Allow Bulk Purchase: %2 No. of Trades: %3"),
      args0: [
        // All arguments are now in a single args0 array, matching message0 placeholders
        {
          type: "field_dropdown",
          name: "PURCHASE_LIST",
          options: [["", ""]],
        },
        {
          type: "field_dropdown",
          name: "ALLOW_BULK_PURCHASE",
          options: [
            [localize("No"), "FALSE"],
            [localize("Yes"), "TRUE"],
          ],
          value: "FALSE", // Default to No
        },
        {
          type: "field_number",
          name: "NO_OF_TRADES",
          value: 1,
          min: 1,
          precision: 0, // Ensure it's an integer
        },
      ],
      previousStatement: null,
      inputsInline: true, // This is crucial for rendering all inputs on one line
      colour: window.Blockly.Colours.Special1.colour,
      colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
      colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
      tooltip: localize("This block purchases contract of a specified type."),
      category: window.Blockly.Categories.Before_Purchase,
    }
  },
  meta() {
    return {
      display_name: localize("Purchase"),
      description: localize(
        "Use this block to purchase the specific contract you want. You may add multiple Purchase blocks together with conditional blocks to define your purchase conditions. This block can only be used within the Purchase conditions block.",
      ),
      key_words: localize("buy"),
    }
  },
  onchange(event) {
    if (!this.workspace || window.Blockly.derivWorkspace.isFlyoutVisible || this.workspace.isDragging()) {
      return
    }
    if (event.type === window.Blockly.Events.BLOCK_CREATE && event.ids.includes(this.id)) {
      this.populatePurchaseList(event)
    } else if (event.type === window.Blockly.Events.BLOCK_CHANGE) {
      if (event.name === "TYPE_LIST" || event.name === "TRADETYPE_LIST") {
        this.populatePurchaseList(event)
      }
    } else if (event.type === window.Blockly.Events.BLOCK_DRAG && !event.isStart && event.blockId === this.id) {
      const purchase_type_list = this.getField("PURCHASE_LIST")
      const purchase_options = purchase_type_list.menuGenerator_ // eslint-disable-line
      if (purchase_options[0][0] === "") {
        this.populatePurchaseList(event)
      }
    }
  },
  populatePurchaseList(event) {
    const trade_definition_block = this.workspace.getTradeDefinitionBlock()
    if (trade_definition_block) {
      const trade_type_block = trade_definition_block.getChildByType("trade_definition_tradetype")
      const trade_type = trade_type_block.getFieldValue("TRADETYPE_LIST")
      const contract_type_block = trade_definition_block.getChildByType("trade_definition_contracttype")
      const contract_type = contract_type_block.getFieldValue("TYPE_LIST")
      const purchase_type_list = this.getField("PURCHASE_LIST")
      const purchase_type = purchase_type_list.getValue()
      const contract_type_options = getContractTypeOptions(contract_type, trade_type)
      purchase_type_list.updateOptions(contract_type_options, {
        default_value: purchase_type,
        event_group: event.group,
        should_pretend_empty: true,
      })
    }
  },
  customContextMenu(menu) {
    const menu_items = [localize("Enable Block"), localize("Disable Block")]
    excludeOptionFromContextMenu(menu, menu_items)
    modifyContextMenu(menu)
  },
  restricted_parents: ["before_purchase"],
}

window.Blockly.JavaScript.javascriptGenerator.forBlock.purchase = (block) => {
  const purchaseList = block.getFieldValue("PURCHASE_LIST")
  const allowBulkPurchase = block.getFieldValue("ALLOW_BULK_PURCHASE")
  const noOfTrades = block.getFieldValue("NO_OF_TRADES")

  // Debug logs (keep them for now to confirm it's working)
  console.log("Generated Code Debug:")
  console.log("PURCHASE_LIST:", purchaseList)
  console.log("ALLOW_BULK_PURCHASE:", allowBulkPurchase)
  console.log("NO_OF_TRADES:", noOfTrades)

  const allowBulkJs = allowBulkPurchase === "TRUE" ? "true" : "false"

  const code = `Bot.purchase('${purchaseList}', { allowBulk: ${allowBulkJs}, numTrades: ${noOfTrades} });\n`
  console.log("Full generated code:", code)
  return code
}
