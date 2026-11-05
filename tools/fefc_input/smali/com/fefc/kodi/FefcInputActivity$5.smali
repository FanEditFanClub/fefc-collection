.class Lcom/fefc/kodi/FefcInputActivity$5;
.super Ljava/lang/Object;
.source "FefcInputActivity.java"

# interfaces
.implements Ljava/lang/Runnable;


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

    .line 71
    iput-object p1, p0, Lcom/fefc/kodi/FefcInputActivity$5;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    iput-object p2, p0, Lcom/fefc/kodi/FefcInputActivity$5;->val$et:Landroid/widget/EditText;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .registers 4

    .line 73
    iget-object v0, p0, Lcom/fefc/kodi/FefcInputActivity$5;->this$0:Lcom/fefc/kodi/FefcInputActivity;

    const-string v1, "input_method"

    invoke-virtual {v0, v1}, Lcom/fefc/kodi/FefcInputActivity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/view/inputmethod/InputMethodManager;

    .line 74
    if-eqz v0, :cond_12

    iget-object v1, p0, Lcom/fefc/kodi/FefcInputActivity$5;->val$et:Landroid/widget/EditText;

    const/4 v2, 0x1

    invoke-virtual {v0, v1, v2}, Landroid/view/inputmethod/InputMethodManager;->showSoftInput(Landroid/view/View;I)Z

    .line 75
    :cond_12
    return-void
.end method
