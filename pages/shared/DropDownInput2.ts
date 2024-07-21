import { asRef, Box, Button, ButtonComponent, ButtonStyle, Color, Component, createElement, Empty, Grid, InputForm, Items, Layer, MIcon, Refable, TextInput } from "webgen/mod.ts";
import { Popover } from "webgen/src/components/Popover.ts";

const content = asRef(Box());
const dropDownPopover = Popover(
    Layer(
        content.asRefComponent(),
        5,
    ).setBorderRadius("mid").addClass("wdropdown-outer-layer"),
)
    .pullingAnchorPositioning("--wdropdown-default", (rect, style) => {
        style.top = `max(-5px, ${rect.bottom}px)`;
        style.left = `${rect.left}px`;
        style.minWidth = `${rect.width}px`;
        style.bottom = "var(--gap)";
    });

class DropDownInputComponent<Value extends string> extends InputForm<Value> {
    prog = createElement("div");
    text = createElement("span");
    #search = false;
    suffix: Component | undefined;
    button: ButtonComponent;
    constructor(dropdown: Refable<string[]>, label: Refable<string | Component>, icon = MIcon("keyboard_arrow_down")) {
        super();

        const text = asRef(label);
        this.button = Button(text)
            .setWidth("100%")
            .setJustifyContent("space-between")
            .addSuffix(icon);

        this.wrapper.innerHTML = "";
        this.color.setValue(Color.Disabled);
        this.wrapper.append(this.button.draw());
        this.wrapper.classList.add("wdropdown");

        this.addEventListener("update", (event) => {
            const data = (<CustomEvent<Value>> event).detail;
            text.setValue(data == undefined ? asRef(label).getValue() : this.valueRender(data));
            dropDownPopover.hidePopover();
        });

        this.button.onClick(() => {
            if (dropDownPopover.isOpen()) {
                dropDownPopover.hidePopover();
                return;
            }
            dropDownPopover.clearAnchors("--wdropdown-default");
            this.button.setAnchorName("--wdropdown-default");
            dropDownPopover.showPopover();
            const search = asRef("");
            content.setValue(
                Grid(
                    this.#search
                        ? TextInput("text", "Search")
                            .onChange((x) => search.setValue(x!))
                            //idk if that's a real 10/10 solution
                            .setAttribute("style", "z-index: 0")
                        : Empty(),
                    search.map((s) =>
                        Items(asRef(dropdown).map((x) => x.filter((y) => y.includes(s))), (item) =>
                            Button(this.valueRender(item as Value))
                                .setStyle(ButtonStyle.Inline)
                                .onClick(() => {
                                    this.setValue(item as Value);
                                }))
                    ).asRefComponent(),
                    this.suffix ?? Empty(),
                )
                    .addClass("wdropdown-content")
                    .setDirection("row")
                    .setGap("5px")
                    .setPadding("5px"),
            );
        });
    }
    setStyle(style: ButtonStyle, progress?: number) {
        this.button.setStyle(style, progress);
        return this;
    }
    enableSearch() {
        this.#search = true;
        return this;
    }
    addDropdownSuffix(component: Component) {
        this.suffix = component;
        return this;
    }
}

export const DropDownInput2 = (label: string, list: Refable<string[]>) => new DropDownInputComponent(list, label);
