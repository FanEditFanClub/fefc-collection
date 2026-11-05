.class Lcom/fefc/kodi/FefcInputActivity$4;
.super Ljava/lang/Object;
.source "FefcInputActivity.java"

# interfaces
.implements Landroid/content/DialogInterface$OnClickListener;


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

    .line 59
    iput-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$4;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    iput-object p2, p0, Lcom/fefc/kodi/FefcInputActivity$4;->val$et:Landroid/widget/EditText;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public onClick(Landroid/content/DialogInterface;I)V
    .registers 4

    .line 60
    iget-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$4;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    new-instance p2, Ljava/lang/StringBuilder;

    invoke-direct {p2}, Ljava/lang/StringBuilder;-><init>()V

    const-string v0, "OK\n"

    invoke-virtual {p2, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object p2

    iget-object v0, p0, Lcom/fefc/kodi/FefcInputActivity$4;->val$et:Landroid/widget/EditText;

    invoke-virtual {v0}, Landroid/widget/EditText;->getText()Landroid/text/Editable;

    move-result-object v0

    invoke-virtual {v0}, Ljava/lang/Object;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p2, v0}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    move-result-object p2

    invoke-virtual {p2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object p2

    # invokes: Lcom/fefc/kodi/FefcInputActivity;->finishWith(Ljava/lang/String;)V
    invoke-static {p1, p2}, Lcom/fefc/kodi/FefcInputActivity;->access$000(Lcom/fefc/kodi/FefcInputActivity;Ljava/lang/String;)V

    return-void
.end method
