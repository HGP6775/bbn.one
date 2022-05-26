import { Button, ButtonStyle, loadingWheel, Center, Color, Horizontal, PlainText, Spacer, Vertical, View, WebGen, Custom, Box, img, CenterV, Component } from "../../deps.ts";
import '../../assets/css/main.css';
import '../../assets/css/components/subsidiaries.css';
import '../../assets/css/music.css'
import artwork from "../../assets/img/template-artwork.png";
import { DynaNavigation } from "../../components/nav.ts";
import { GetCachedProfileData, ProfileData, Redirect } from "./helper.ts";
import { API, Drop } from "./RESTSpec.ts";

WebGen({
})
Redirect();

const view = View<{ list: Drop[], type: Drop[ "type" ], aboutMe: ProfileData }>(({ state, update }) => Vertical(
    DynaNavigation("Music", state.aboutMe),
    Horizontal(
        Vertical(
            Horizontal(
                PlainText(`Hi ${state.aboutMe?.name}! 👋`)
                    .setFont(2.260625, 700),
                Spacer()
            ).setMargin("0 0 18px"),
            Horizontal(
                Button("Published")
                    .setColor(Color.Colored)
                    .addClass("tag")
                    .setStyle(state.type == "PUBLISHED" ? ButtonStyle.Normal : ButtonStyle.Secondary)
                    .onClick(() => update({ type: "PUBLISHED" })),
                Button("Unpublished")
                    .setColor(Color.Colored)
                    .setStyle(state.type == "PRIVATE" ? ButtonStyle.Normal : ButtonStyle.Secondary)
                    .onClick(() => update({ type: "PRIVATE" }))
                    .addClass("tag"),
                state.list?.find(x => x.type == "UNSUBMITTED") ?
                    Button(`Drafts (${state.list.filter(x => x.type == "UNSUBMITTED").length})`)
                        .setColor(Color.Colored)
                        .onClick(() => update({ type: "UNSUBMITTED" }))
                        .setStyle(state.type == "UNSUBMITTED" ? ButtonStyle.Normal : ButtonStyle.Secondary)
                        .addClass("tag")
                    : null,
                Spacer()
            ).setGap("10px")
        ),
        Spacer(),
        Vertical(
            Spacer(),
            Button("Submit new Drop")
                .onPromiseClick(async () => {
                    const id = await API.music(API.getToken()).post();
                    // TODO: Currently not supported:
                    // location.href = `/music/new-drop/${id}`;
                    location.href = `/music/new-drop?id=${id}`;
                }),
            Spacer()
        )
    )
        .setPadding("5rem 0 0 0")
        .addClass("limited-width"),
    Box((() => {
        if (!state.list)
            return Custom(loadingWheel() as Element as HTMLElement)
        if (state.list.length != 0)
            return Vertical(
                CategoryRender(
                    state.list
                        .filter(x => state.type == "PUBLISHED" ? x.type == "PUBLISHED" : true)
                        .filter(x => state.type == "PRIVATE" ? x.type == "PRIVATE" || x.type == "UNDER_REVIEW" : true)
                        .filter(x => state.type == "UNSUBMITTED" ? x.type == "UNSUBMITTED" : true)
                        .filter((_, i) => i == 0),
                    "Latest Drop"
                ),
                CategoryRender(
                    state.list
                        .filter(x => state.type == "PUBLISHED" ? x.type == "PUBLISHED" : true)
                        .filter(x => state.type == "PRIVATE" ? x.type == "PRIVATE" || x.type == "UNDER_REVIEW" : true)
                        .filter(x => state.type == "UNSUBMITTED" ? x.type == "UNSUBMITTED" : true)
                        .filter((_, i) => i > 0),
                    "History"
                )
            )
                .setGap("20px");
        return Center(PlainText("Wow such empty")).setPadding("5rem");
    })()).addClass("loading"),
))
    .change(({ update }) => update({ type: "PUBLISHED", aboutMe: GetCachedProfileData() }))
    .appendOn(document.body);

API.music(API.getToken()).list.get()
    .then(x => view.viewOptions().update({ list: x }))

function CategoryRender(dropList: Drop[], title: string): Component | (Component | null)[] | null {
    if (dropList.length == 0)
        return null;
    return [
        PlainText(title)
            .addClass("list-title")
            .addClass("limited-width"),
        ...dropList.map(x => DropEntry(x))
    ];
}

function DropEntry(x: Drop): Component {
    return Horizontal(
        Custom(img(x.artwork ?? artwork)),
        CenterV(
            PlainText(x.title ?? "(no name)")
                .setMargin("-0.4rem 0 0")
                .setFont(2.25, 700),
            PlainText(x.release ?? "(no release date)")
                .setFont(1, 700)
                .addClass("entry-subtitle")
        ),
        CenterV(
            PlainText(x.upc ? `UPC ${x.upc}` : "(no upc number)")
                .addClass("entry-subtitle")
                .setFont(1, 700)
        ),
        Spacer()
    )
        .setGap("40px")
        .addClass("list-entry")
        .addClass("limited-width")
        .onClick(() => x.type === "UNSUBMITTED" ? location.href = "/music/new-drop?id=" + x.id : {});
}
