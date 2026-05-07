---
title: "Template: Markdown post"
description: "A template post that exercises every renderable element. Delete or replace before publishing."
pubDate: 2026-05-01
updatedDate: 2026-05-04
tags: ["template", "rendering"]
draft: false
interactive: false
---

> This is a **template post**. It exists so you can see how every element
> renders. Delete it (or replace its body) before publishing anything real.

## A brief preamble

This paragraph exists so you can confirm that body copy in the chosen serif
reads pleasantly at a 66ch measure with generous line height. Adjust
`--measure` in `global.css` if your taste differs. Setting type is one of
the few decisions that's worth getting right early[^typography].

### Smaller heading

Subsection-level headings should feel related to their section, not
shouted. Run a few of them in a row to confirm vertical rhythm.

## Lists

Unordered:

- An item.
- Another item with a longer line, long enough to wrap so you can confirm
  that the second line aligns the way you expect against the first.
- A third item.

Ordered:

1. First.
2. Second.
3. Third.

## Code

Inline code: `array.flatMap(x => x.children)` should sit comfortably inside
a sentence without disturbing the line height.

A TypeScript fence:

```ts
type Post = {
  title: string;
  pubDate: Date;
  tags: string[];
};

function recent<T extends { pubDate: Date }>(items: T[], n = 5): T[] {
  return [...items]
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf())
    .slice(0, n);
}
```

A Python fence — different language to confirm Shiki picks up the grammar
and the dual-theme swap renders both cleanly:

```python
import torch
import torch.nn as nn

class TinyMLP(nn.Module):
    def __init__(self, d_in: int, d_hidden: int, d_out: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_in, d_hidden),
            nn.GELU(),
            nn.Linear(d_hidden, d_out),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)
```

## A blockquote

> The truth is rarely pure and never simple.
>
> — Oscar Wilde, paraphrased

## A captioned image

![A small placeholder image with descriptive alt text for accessibility.](https://placehold.co/800x400/16130e/c89b3c?text=replace+me "Use the markdown title syntax to add a caption — like this one.")

## A table

| Model        | Params | Throughput | Notes                        |
| ------------ | -----: | ---------: | ---------------------------- |
| Tiny         |  10 M  |  4200 t/s  | CPU-friendly                 |
| Small        | 125 M  |  1100 t/s  | Single GPU                   |
| Medium       | 1.3 B  |   180 t/s  | Multi-GPU; tensor parallel   |

## Footnotes

The footnote reference earlier should jump down here, and a back-link
should return you to the spot you came from[^stress-test].

[^typography]: Typography is one of those areas where small choices
    compound — line length, x-height, weight contrast — and the only way
    to know if it works is to read into it for a few minutes.

[^stress-test]: This second footnote exists so you can see how the
    rendered footnotes block looks when there's more than one.
