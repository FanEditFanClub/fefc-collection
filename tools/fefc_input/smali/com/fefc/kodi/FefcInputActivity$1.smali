.class Lcom/fefc/kodi/FefcInputActivity$1;
.super Ljava/lang/Object;
.source "FefcInputActivity.java"

# interfaces
.implements Landroid/widget/TextView$OnEditorActionListener;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/fefc/kodi/FefcInputActivity;->onCreate(Landroid/os/Bundle;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/fefc/kodi/FefcInputActivity;

.field final synthetic val$et:Landroid/widget/EditText;


# direct methods
.method constructor <init>(Lcom/fefc/kodi/FefcInputActivity;Landroid/widget/EditText;)V
    .registers 3
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()V"
        }
    .end annotation

    .line 47
    iput-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$1;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    iput-object p2, p0, Lcom/fefc/kodi/FefcInputActivity$1;->val$et:Landroid/widget/EditText;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onEditorAction(Landroid/widget/TextView;ILandroid/view/KeyEvent;)Z
    .registers 5

    .line 49
    const/4 p1, 0x2

    const/4 v0, 0x1

    if-eq p2, p1, :cond_1d

    const/4 p1, 0x6

    if-eq p2, p1, :cond_1d

    const/4 p1, 0x3

    if-eq p2, p1, :cond_1d

    if-eqz p3, :cond_1b

    .line 50
    invoke-virtual {p3}, Landroid/view/KeyEvent;->getKeyCode()I

    move-result p1

    const/16 p2, 0x42

    if-ne p1, p2, :cond_1b

    invoke-virtual {p3}, Landroid/view/KeyEvent;->getAction()I

    move-result p1

    if-ne p1, v0, :cond_1b

    goto :goto_1d

    .line 54
    :cond_1b
    const/4 p1, 0x0

    return p1

    .line 51
    :cond_1d
    :goto_1d
    iget-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$1;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    new-instance p2, Ljava/lang/StringBuilder;

    invoke-direct {p2}, Ljava/lang/StringBuilder;-><init>()V

    const-string p3, "OK\n"

    invoke-virtual {p2, p3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object p2

    iget-object p3, p0, Lcom/fefc/kodi/FefcInputActivity$1;->val$et:Landroid/widget/EditText;

    invoke-virtual {p3}, Landroid/widget/EditText;->getText()Landroid/text/Editable;

    move-result-object p3

    invoke-virtual {p3}, Ljava/lang/Object;->toString()Ljava/lang/String;

    move-result-object p3

    invoke-virtual {p2, p3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object p2

    invoke-virtual {p2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p2

    # invokes: Lcom/fefc/kodi/FefcInputActivity;->finishWith(Ljava/lang/String;)V
    invoke-static {p1, p2}, Lcom/fefc/kodi/FefcInputActivity;->access$000(Lcom/fefc/kodi/FefcInputActivity;Ljava/lang/String;)V

    .line 52
    return v0
.end method
